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
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-3 py-2 bg-gray-50 border-b border-gray-100">
      {shown.map((i) => (
        <span key={i.label} className="inline-flex items-baseline gap-1">
          <span className="text-[10px] text-gray-400 font-medium">{i.label}</span>
          <span
            className={
              i.primary
                ? "phonetic-ipa text-[15px] text-gray-700"
                : "phonetic-ipa text-[13px] text-gray-500"
            }
          >
            {i.value}
          </span>
        </span>
      ))}
    </div>
  );
}
