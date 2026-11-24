import iconUrl from "../../assets/icon.png";

interface BrandLogoProps {
  size?: number;
  className?: string;
}

export function BrandLogo({ size = 36, className }: BrandLogoProps) {
  return <img src={iconUrl} width={size} height={size} className={className} alt="" draggable={false} />;
}
