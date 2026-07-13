import type { Phonetics } from "../lib/types";

/** 音标条：IPA / UK / US / 拼音 */
export function PhoneticsBar({ phonetics }: { phonetics: Phonetics | null }) {
  if (!phonetics) return null;
  const items: { label: string; value: string | null; primary?: boolean }[] = [
    { label: "IPA", value: phonetics.ipa, primary: true },
    { label: "英", value: phonetics.uk },
    { label: "美", value: phonetics.us },
    { label: "拼音", value: phonetics.pinyin },
  ];
  const shown = items.filter((i) => i.value);
  if (shown.length === 0) return null;

  return (
    <div className="phonetics-bar">
      {shown.map((i) => (
        <span key={i.label} className="phonetic-item">
          <span className="phonetic-label">{i.label}</span>
          <span
            className={
              i.primary
                ? "phonetic-ipa is-primary"
                : "phonetic-ipa"
            }
          >
            {i.value}
          </span>
        </span>
      ))}
    </div>
  );
}
