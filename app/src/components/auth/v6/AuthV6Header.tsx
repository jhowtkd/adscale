import Image from "next/image";

type AuthV6HeaderProps = {
  sectionLabel: string;
  title: string;
  subtitle: string;
  showLogo?: boolean;
};

export default function AuthV6Header({ sectionLabel, title, subtitle, showLogo = true }: AuthV6HeaderProps) {
  return (
    <header className="space-y-3 text-center lg:text-left">
      {showLogo ? (
        <div className="flex justify-center lg:justify-start">
          <Image
            src="/images/logo.svg"
            alt="ADScale"
            className="h-7 w-auto object-contain lg:hidden"
            width={813}
            height={142}
            priority
            unoptimized
          />
        </div>
      ) : null}
      <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-muted)]">{sectionLabel}</p>
      <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-[1.75rem]">
        {title}
      </h1>
      <p className="text-sm leading-relaxed text-[var(--text-secondary)]">{subtitle}</p>
    </header>
  );
}
