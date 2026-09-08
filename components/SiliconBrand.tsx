import Image from 'next/image';
export function SiliconBrand({ compact = false, className = '' }: { compact?: boolean; className?: string }) {
  return compact ? <span className={`silicon-brand compact ${className}`} aria-label="Silicon Racer"><span>SILICON</span><strong>RACER<span aria-hidden="true">✳</span></strong></span> : <Image unoptimized className={`silicon-brand badge ${className}`} src="/branding/silicon-racer-badge.png" alt="Silicon Racer — San Francisco Soapbox Club" width={1254} height={1254}/>;
}
