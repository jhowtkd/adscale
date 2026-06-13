import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Política de Privacidade — ADScale",
  description: "Como coletamos, usamos e protegemos seus dados.",
};

export default function PrivacyPage() {
  return (
    <main id="main" className="mx-auto max-w-3xl px-6 py-16 text-[var(--text-primary)]">
      <h1 className="text-3xl font-bold">Política de Privacidade</h1>
      <p className="mt-2 text-sm text-[var(--text-secondary)]">
        Última atualização: 22 de maio de 2026
      </p>

      <section className="mt-10 space-y-6 text-sm leading-relaxed text-[var(--text-secondary)]">
        <div>
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">1. Quem somos</h2>
          <p className="mt-2">
            ADScale é uma plataforma SaaS de derivação criativa para campanhas de marketing.
            Somos responsáveis pelo tratamento dos seus dados pessoais nos termos da LGPD.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">2. Dados que coletamos</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li><strong>Dados de cadastro:</strong> nome, e-mail, senha (criptografada).</li>
            <li><strong>Dados de uso:</strong> campanhas criadas, briefings, imagens enviadas e derivadas.</li>
            <li><strong>Dados técnicos:</strong> IP, navegador, idioma preferido, cookies necessários.</li>
            <li><strong>Dados de pagamento:</strong> processados exclusivamente pelo Stripe. Não armazenamos cartões.</li>
          </ul>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">3. Finalidade do tratamento</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Prestar o serviço de geração e gestão de criativos.</li>
            <li>Processar pagamentos e gerenciar assinaturas.</li>
            <li>Enviar comunicações operacionais (faturas, alertas de créditos).</li>
            <li>Melhorar a plataforma com base em uso agregado (nunca identificável).</li>
          </ul>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">4. Base legal (LGPD)</h2>
          <p className="mt-2">
            O tratamento de dados pessoais baseia-se no <strong>consentimento</strong> (Art. 7, I)
            para dados de cadastro e no <strong>cumprimento de contrato</strong> (Art. 7, V) para
            dados de uso da plataforma.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">5. Compartilhamento</h2>
          <p className="mt-2">
            Não vendemos dados. Compartilhamos apenas com:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li><strong>Stripe</strong>: processamento de pagamentos.</li>
            <li><strong>OpenAI</strong>: geração de planos e imagens (via API, sem retenção de dados de treinamento).</li>
            <li><strong>Cloudflare R2</strong>: armazenamento de imagens.</li>
          </ul>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">6. Retenção e exclusão</h2>
          <p className="mt-2">
            Mantemos seus dados enquanto sua conta estiver ativa. Após solicitação de exclusão,
            removemos todos os dados pessoais em até <strong>30 dias</strong>, exceto quando houver
            obrigação legal de retenção (ex: notas fiscais por 5 anos).
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">7. Seus direitos (LGPD)</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Acessar seus dados pessoais.</li>
            <li>Corrigir dados incompletos ou desatualizados.</li>
            <li>Solicitar anonimização, bloqueio ou eliminação.</li>
            <li>Portabilidade dos dados para outro serviço.</li>
            <li>Revogar consentimento a qualquer momento.</li>
          </ul>
          <p className="mt-2">
            Para exercer seus direitos, envie um e-mail para{" "}
            <a href="mailto:privacidade@adscale.io" className="text-[var(--accent-green)] hover:underline">
              privacidade@adscale.io
            </a>.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">8. Cookies</h2>
          <p className="mt-2">
            Utilizamos cookies estritamente necessários para autenticação e segurança.
            Cookies analíticos e de marketing são opcionais e requerem seu consentimento.
            Veja nosso banner de cookies para gerenciar preferências.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">9. Segurança</h2>
          <p className="mt-2">
            Dados em trânsito via TLS 1.3. Senhas hasheadas com bcrypt. Acesso a dados restrito
            por workspace isolation. Auditoria de acesso em logs.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">10. Alterações</h2>
          <p className="mt-2">
            Notificaremos alterações materiais por e-mail e via banner na plataforma.
            A versão atual sempre estará disponível nesta página.
          </p>
        </div>
      </section>
    </main>
  );
}
