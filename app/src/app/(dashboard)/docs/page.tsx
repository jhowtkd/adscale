import Link from "next/link";
import PageFrame from "@/components/layout/PageFrame";
import PageHeader from "@/components/layout/PageHeader";
import Panel from "@/components/layout/Panel";

const helpLinks = [
  {
    href: "/campaigns?new=1",
    title: "Criar campanha",
    description: "Comece uma nova campanha e gere variações criativas.",
  },
  {
    href: "/templates",
    title: "Templates",
    description: "Use modelos prontos para acelerar o briefing.",
  },
  {
    href: "/library",
    title: "Biblioteca",
    description: "Gerencie referências e assets da sua marca.",
  },
  {
    href: "/feedback",
    title: "Feedback",
    description: "Envie dúvidas, bugs ou sugestões para o time.",
  },
];

export default function DocsPage() {
  return (
    <PageFrame>
      <PageHeader title="Documentação" description="Atalhos e recursos para usar o ADScale." />
      <Panel>
        <ul className="divide-y divide-[var(--border-dim)]">
          {helpLinks.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className="flex flex-col gap-1 px-1 py-4 transition-colors hover:text-[var(--accent-primary-text)]"
              >
                <span className="text-sm font-medium text-[var(--text-primary)]">{link.title}</span>
                <span className="text-sm text-[var(--text-muted)]">{link.description}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Panel>
    </PageFrame>
  );
}
