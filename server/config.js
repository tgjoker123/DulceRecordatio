import 'dotenv/config';

/**
 * Ponto único de leitura de variáveis de ambiente.
 * Nada de segredo espalhado pelo código.
 */
export const config = {
  databaseUrl: process.env.DATABASE_URL || '',
  jwtSecret: process.env.JWT_SECRET || '',
  siteUrl: (process.env.SITE_URL || 'http://localhost:3000').replace(/\/$/, ''),
  port: Number(process.env.PORT) || 3000,
  isProd: process.env.NODE_ENV === 'production',

  mp: {
    accessToken: process.env.MP_ACCESS_TOKEN || '',
    linkFallback: process.env.MP_LINK_FALLBACK || '',
  },

  freteGratisAcima: Number(process.env.FRETE_GRATIS_ACIMA) || 0,
};

/** Falta alguma coisa essencial? Avisa alto e claro na hora de subir. */
export function checarConfig() {
  const faltando = [];
  if (!config.databaseUrl) faltando.push('DATABASE_URL');
  if (!config.jwtSecret || config.jwtSecret.length < 24) faltando.push('JWT_SECRET (mínimo 24 caracteres)');

  if (faltando.length) {
    console.error('\n  Configuração incompleta. Faltando no arquivo .env:');
    faltando.forEach((v) => console.error(`   - ${v}`));
    console.error('\n  Copie o .env.example para .env e preencha os valores.\n');
    return false;
  }
  return true;
}
