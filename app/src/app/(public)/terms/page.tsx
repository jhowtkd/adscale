import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Termos de Uso — ADScale",
  description: "Condições e responsabilidades do uso da plataforma.",
};

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 text-[var(--text-primary)]">
      <h1 className="text-3xl font-bold">Termos de Uso</h1>
      <p className="mt-2 text-sm text-[var(--text-secondary)]">
        Última atualização: 22 de maio de 2026
      </p>

      <section className="mt-10 space-y-6 text-sm leading-relaxed text-[var(--text-secondary)]">
        <div>
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">1. Aceitação</h2>
          <p className="mt-2">
            Ao criar uma conta e utilizar o ADScale, você concorda com estes Termos de Uso
            e com nossa Política de Privacidade. Se não concordar, não utilize o serviço.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">2. Descrição do serviço</h2>
          <p className="mt-2">
            ADScale é uma plataforma SaaS que utiliza inteligência artificial para gerar
            planos criativos e variações de imagens a partir de briefings e referências visuais.
            O serviço é fornecido "como está", sem garantias de resultados específicos.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">3. Conta e responsabilidades</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Você é responsável por manter a confidencialidade de sua senha.</li>
            <li>Você deve ter autorização legal para usar as imagens e marcas que enviar.</li>
            <li>Proibido usar a plataforma para criar conteúdo ilícito, difamatório ou que viole direitos autorais de terceiros.</li>
            <li>Cada workspace deve ser usado pela organização titular. Compartilhamento de contas entre empresas não autorizado.</li>
          </ul>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">4. Propriedade intelectual</h2>
          <p className="mt-2">
            <strong>Seu conteúdo:</strong> você mantém todos os direitos sobre imagens enviadas,
            briefings e campanhas criadas. Concede ao ADScale uma licença limitada para processar
            esse conteúdo exclusivamente para prestar o serviço.
          </p>
          <p className="mt-2">
            <strong>Derivações geradas:</strong> as imagens geradas pela IA são de sua propriedade,
            desde que você tenha direitos sobre a imagem base. O ADScale não reivindica propriedade
            sobre outputs gerados.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">5. Pagamentos e assinaturas</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Planos pagos são cobrados mensalmente via Stripe.</li>
            <li>Trial de 14 dias. Cancelamento pode ser feito a qualquer momento pelo portal do Stripe.</li>
            <li>Não realizamos reembolsos parciais de períodos já iniciados, exceto em caso de falha técnica comprovada.</li>
            <li>Créditos não utilizados não são transferidos entre meses, salvo disposição contratual específica.</li>
          </ul>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">6. Limitação de responsabilidade</h2>
          <p className="mt-2">
            O ADScale não se responsabiliza por:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Resultados de campanhas ou performance de anúncios.</li>
            <li>Violação de direitos autorais por parte do usuário no conteúdo enviado.</li>
            <li>Indisponibilidade temporária por manutenção ou falhas de serviços de terceiros (OpenAI, Stripe, Cloudflare).</li>
          </ul>
          <p className="mt-2">
            Nossa responsabilidade máxima está limitada ao valor pago pelo usuário nos últimos 12 meses.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">7. Rescisão</h2>
          <p className="mt-2">
            Podemos suspender ou encerrar sua conta em caso de violação destes termos.
            Você pode solicitar exclusão da conta a qualquer momento em Configurações.
            Dados serão removidos em até 30 dias, exceto quando houver obrigação legal.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">8. Alterações</h2>
          <p className="mt-2">
            Alterações materiais serão notificadas por e-mail com 30 dias de antecedência.
            O uso continuado após o prazo constitui aceitação.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">9. Lei aplicável</h2>
          <p className="mt-2">
            Estes termos são regidos pelas leis da República Federativa do Brasil.
            Para resolução de conflitos, fica eleito o foro da comarca de São Paulo/SP.
          </p>
        </div>
      </section>
    </main>
  );
}
