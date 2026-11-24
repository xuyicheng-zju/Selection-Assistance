import AppKit
import ApplicationServices

func attribute(_ element: AXUIElement, _ name: String) -> CFTypeRef? {
    var value: CFTypeRef?
    return AXUIElementCopyAttributeValue(element, name as CFString, &value) == .success ? value : nil
}

func receivedSelection(in pid: pid_t) -> (text: String?, secure: Bool) {
    guard AXIsProcessTrusted() else { return (nil, false) }
    let application = AXUIElementCreateApplication(pid)
    AXUIElementSetMessagingTimeout(application, 0.25)
    guard let focused = attribute(application, kAXFocusedUIElementAttribute),
          CFGetTypeID(focused) == AXUIElementGetTypeID() else { return (nil, false) }
    var element = focused as! AXUIElement
    if attribute(element, kAXSubroleAttribute) as? String == kAXSecureTextFieldSubrole {
        return (nil, true)
    }

    // Some web views expose selection on an ancestor of the focused element.
    for _ in 0..<3 {
        var text = attribute(element, kAXSelectedTextAttribute) as? String
        if text == nil,
           let range = attribute(element, kAXSelectedTextRangeAttribute),
           CFGetTypeID(range) == AXValueGetTypeID() {
            var selected = CFRange()
            let axRange = range as! AXValue
            if AXValueGetValue(axRange, .cfRange, &selected), selected.length > 0 {
                var value: CFTypeRef?
                if AXUIElementCopyParameterizedAttributeValue(
                    element, kAXStringForRangeParameterizedAttribute as CFString, range, &value
                ) == .success {
                    text = value as? String
                }
            }
        }
        if let text = text?.trimmingCharacters(in: .whitespacesAndNewlines), !text.isEmpty {
            return (text, false)
        }
        guard let parent = attribute(element, kAXParentAttribute),
              CFGetTypeID(parent) == AXUIElementGetTypeID() else { break }
        element = parent as! AXUIElement
    }
    return (nil, false)
}

func emitGesture(_ kind: String, at point: CGPoint, text: String? = nil) {
    var message: [String: Any] = ["kind": kind, "x": point.x, "y": point.y]
    if let text { message["text"] = text }
    guard var json = try? JSONSerialization.data(withJSONObject: message) else { return }
    json.append(0x0A)
    FileHandle.standardOutput.write(json)
}

final class SelectionNotifications {
    let onChange: (pid_t) -> Void
    var observer: AXObserver?
    var application: AXUIElement?
    var focused: AXUIElement?
    var pid: pid_t = 0

    init(onChange: @escaping (pid_t) -> Void) {
        self.onChange = onChange
    }

    func observe(_ target: pid_t?) {
        if let observer {
            CFRunLoopRemoveSource(CFRunLoopGetMain(), AXObserverGetRunLoopSource(observer), .commonModes)
        }
        observer = nil
        application = nil
        focused = nil
        guard let target, AXIsProcessTrusted() else { return }

        var listener: AXObserver?
        let result = AXObserverCreate(target, { _, _, notification, context in
            guard let context else { return }
            let owner = Unmanaged<SelectionNotifications>.fromOpaque(context).takeUnretainedValue()
            if notification as String == kAXFocusedUIElementChangedNotification {
                owner.observeFocusedElement()
            } else {
                owner.onChange(owner.pid)
            }
        }, &listener)
        guard result == .success, let listener else { return }
        observer = listener
        pid = target
        let app = AXUIElementCreateApplication(target)
        AXUIElementSetMessagingTimeout(app, 0.25)
        application = app
        let context = Unmanaged.passUnretained(self).toOpaque()
        AXObserverAddNotification(listener, app, kAXFocusedUIElementChangedNotification as CFString, context)
        CFRunLoopAddSource(CFRunLoopGetMain(), AXObserverGetRunLoopSource(listener), .commonModes)
        observeFocusedElement()
    }

    func observeFocusedElement() {
        guard let observer, let application else { return }
        let notification = kAXSelectedTextChangedNotification as CFString
        if let focused {
            AXObserverRemoveNotification(observer, focused, notification)
        }
        focused = nil
        guard let value = attribute(application, kAXFocusedUIElementAttribute),
              CFGetTypeID(value) == AXUIElementGetTypeID() else { return }
        let element = value as! AXUIElement
        focused = element
        AXObserverAddNotification(observer, element, notification, Unmanaged.passUnretained(self).toOpaque())
    }
}

func watchSelections(ignoring host: pid_t) {
    NSApplication.shared.setActivationPolicy(.prohibited)
    var leftDown: CGPoint?
    var generation = 0
    var lastShown: String?

    func capture(_ target: pid_t, at position: CGPoint) {
        guard target != host else { return }
        generation += 1
        let current = generation
        DispatchQueue.main.asyncAfter(deadline: .now() + .milliseconds(70)) {
            guard current == generation, leftDown == nil,
                  !CGEventSource.buttonState(.combinedSessionState, button: .left),
                  target == NSWorkspace.shared.frontmostApplication?.processIdentifier else { return }
            DispatchQueue.global(qos: .userInitiated).async {
                let selection = receivedSelection(in: target)
                DispatchQueue.main.async {
                    guard current == generation,
                          target == NSWorkspace.shared.frontmostApplication?.processIdentifier,
                          selection.text != lastShown else { return }
                    lastShown = selection.text
                    if let text = selection.text {
                        emitGesture("selection", at: position, text: text)
                    } else {
                        emitGesture("dismiss", at: position)
                    }
                }
            }
        }
    }

    let notifications = SelectionNotifications { target in
        guard leftDown == nil, let position = CGEvent(source: nil)?.location else { return }
        capture(target, at: position)
    }
    func observeFrontmost() {
        let pid = NSWorkspace.shared.frontmostApplication?.processIdentifier
        notifications.observe(pid == host ? nil : pid)
    }
    observeFrontmost()
    let activation = NSWorkspace.shared.notificationCenter.addObserver(
        forName: NSWorkspace.didActivateApplicationNotification, object: nil, queue: .main
    ) { _ in
        generation += 1
        if !CGEventSource.buttonState(.combinedSessionState, button: .left) { leftDown = nil }
        lastShown = nil
        if let point = CGEvent(source: nil)?.location { emitGesture("dismiss", at: point) }
        observeFrontmost()
    }

    let mask: NSEvent.EventTypeMask = [.leftMouseDown, .leftMouseUp, .rightMouseDown, .otherMouseDown]
    let monitor = NSEvent.addGlobalMonitorForEvents(matching: mask, handler: { event in
        guard let position = event.cgEvent?.location else { return }
        if event.type != .leftMouseUp {
            generation += 1
            lastShown = nil
            leftDown = event.type == .leftMouseDown ? position : nil
            emitGesture("dismiss", at: position)
            return
        }
        guard let start = leftDown else { return }
        leftDown = nil
        guard hypot(position.x - start.x, position.y - start.y) >= 5 || event.clickCount >= 2,
              let target = NSWorkspace.shared.frontmostApplication?.processIdentifier else { return }
        capture(target, at: position)
    })

    withExtendedLifetime((monitor, activation, notifications)) {
        NSApplication.shared.run()
    }
}

if CommandLine.arguments.count == 3, CommandLine.arguments[1] == "--watch",
   let host = pid_t(CommandLine.arguments[2]) {
    watchSelections(ignoring: host)
    exit(0)
}

guard let frontmost = NSWorkspace.shared.frontmostApplication else { exit(0) }
let selection = receivedSelection(in: frontmost.processIdentifier)
if selection.secure { exit(0) }
if let text = selection.text {
    print(text, terminator: "")
    exit(0)
}

guard CGPreflightPostEventAccess() else { exit(2) }
let modifiers: CGEventFlags = [.maskCommand, .maskShift, .maskAlternate, .maskControl]
let releaseDeadline = Date().addingTimeInterval(0.65)
while !CGEventSource.flagsState(.combinedSessionState).intersection(modifiers).isEmpty {
    guard Date() < releaseDeadline else { exit(0) }
    Thread.sleep(forTimeInterval: 0.015)
}
guard NSWorkspace.shared.frontmostApplication?.processIdentifier == frontmost.processIdentifier else { exit(0) }

let clipboard = NSPasteboard.general
let originalChange = clipboard.changeCount
let originalItems: [NSPasteboardItem] = (clipboard.pasteboardItems ?? []).map { item in
    let copy = NSPasteboardItem()
    for type in item.types {
        if let data = item.data(forType: type) {
            copy.setData(data, forType: type)
        }
    }
    return copy
}
guard clipboard.changeCount == originalChange else { exit(0) }

for keyDown in [true, false] {
    guard let event = CGEvent(keyboardEventSource: nil, virtualKey: 8, keyDown: keyDown) else { exit(1) }
    event.flags = .maskCommand
    event.postToPid(frontmost.processIdentifier)
}

let copyDeadline = Date().addingTimeInterval(0.6)
while clipboard.changeCount == originalChange && Date() < copyDeadline {
    Thread.sleep(forTimeInterval: 0.02)
}
if clipboard.changeCount != originalChange {
    let change = clipboard.changeCount
    let text = clipboard.string(forType: .string) ?? ""
    if clipboard.changeCount == change {
        clipboard.clearContents()
        if !originalItems.isEmpty {
            clipboard.writeObjects(originalItems)
        }
    }
    print(text, terminator: "")
}
