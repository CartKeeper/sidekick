import {
  siReact, siVite, siTypescript, siJavascript, siExpress, siNextdotjs, siVuedotjs,
  siNodedotjs, siTailwindcss, siPython, siPostgresql, siSvelte, siElectron, siSupabase,
  siFirebase, siMongodb, siDocker, siGraphql, siPrisma, siGo, siRust, siRedis, siVercel,
  siNetlify, siHtml5, siSass, siFastify, siJest, siVitest, siStripe, siAnthropic, siRedux,
  siZod, siMysql, siSqlite, siAstro, siRemix, siNuxt, siBun, siDeno, siPwa, siReactquery,
  siTanstack, siExpo, siReactrouter, siNestjs, siFlask, siDjango, siRubyonrails, siLaravel,
  siDotnet, siKotlin, siSwift, siFlutter, siDart, siAngular, siSolid, siQwik, siTrpc,
  siDrizzle, siClerk, siAuth0, siResend, siCloudflare, siRailway, siRender, siPlanetscale,
  siNeon, siTurso, siUpstash, siShadcnui, siRadixui, siFramer, siStorybook, siCypress,
  siEslint, siPrettier, siWebpack, siEsbuild, siPnpm, siYarn, siGit, siGithub, siGitlab,
} from 'simple-icons';

type SimpleIcon = { title: string; path: string };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

// Normalized stack name (+ common aliases) → brand logo.
const ICONS: Record<string, SimpleIcon> = {
  react: siReact, reactnative: siReact, rn: siReact,
  vite: siVite,
  typescript: siTypescript, ts: siTypescript,
  javascript: siJavascript, js: siJavascript,
  express: siExpress, expressjs: siExpress,
  next: siNextdotjs, nextjs: siNextdotjs,
  vue: siVuedotjs, vuejs: siVuedotjs,
  node: siNodedotjs, nodejs: siNodedotjs,
  tailwind: siTailwindcss, tailwindcss: siTailwindcss,
  python: siPython, py: siPython,
  postgres: siPostgresql, postgresql: siPostgresql, pg: siPostgresql,
  svelte: siSvelte, sveltekit: siSvelte,
  electron: siElectron,
  supabase: siSupabase,
  firebase: siFirebase,
  mongo: siMongodb, mongodb: siMongodb,
  docker: siDocker,
  graphql: siGraphql,
  prisma: siPrisma,
  go: siGo, golang: siGo,
  rust: siRust,
  redis: siRedis,
  vercel: siVercel,
  netlify: siNetlify,
  html: siHtml5, html5: siHtml5,
  sass: siSass, scss: siSass,
  fastify: siFastify,
  jest: siJest,
  vitest: siVitest,
  stripe: siStripe,
  anthropic: siAnthropic, claude: siAnthropic,
  redux: siRedux,
  zod: siZod,
  mysql: siMysql,
  sqlite: siSqlite,
  astro: siAstro,
  remix: siRemix,
  nuxt: siNuxt,
  bun: siBun,
  deno: siDeno,
  pwa: siPwa,
  reactquery: siReactquery, tanstackquery: siReactquery,
  tanstack: siTanstack,
  expo: siExpo,
  reactrouter: siReactrouter,
  nest: siNestjs, nestjs: siNestjs,
  flask: siFlask,
  django: siDjango,
  rails: siRubyonrails, rubyonrails: siRubyonrails, ruby: siRubyonrails,
  laravel: siLaravel,
  dotnet: siDotnet, net: siDotnet, csharp: siDotnet,
  kotlin: siKotlin,
  swift: siSwift, swiftui: siSwift,
  flutter: siFlutter,
  dart: siDart,
  angular: siAngular,
  solid: siSolid, solidjs: siSolid,
  qwik: siQwik,
  trpc: siTrpc,
  drizzle: siDrizzle,
  clerk: siClerk,
  auth0: siAuth0,
  resend: siResend,
  cloudflare: siCloudflare,
  railway: siRailway,
  render: siRender,
  planetscale: siPlanetscale,
  neon: siNeon,
  turso: siTurso,
  upstash: siUpstash,
  shadcn: siShadcnui, shadcnui: siShadcnui,
  radix: siRadixui, radixui: siRadixui,
  framer: siFramer, framermotion: siFramer,
  storybook: siStorybook,
  cypress: siCypress,
  eslint: siEslint,
  prettier: siPrettier,
  webpack: siWebpack,
  esbuild: siEsbuild,
  pnpm: siPnpm,
  yarn: siYarn,
  git: siGit,
  github: siGithub,
  gitlab: siGitlab,
};

export function getStackIcon(name: string): SimpleIcon | undefined {
  return ICONS[norm(name)];
}

/** A single tech-stack logo (monochrome), or a compact text chip if unmapped. */
export function StackIcon({ name, size = 14 }: { name: string; size?: number }) {
  const icon = getStackIcon(name);

  if (!icon) {
    return (
      <span
        title={name}
        className="inline-flex items-center h-4.5 px-1.5 rounded-sm text-[9px] font-semibold uppercase
                   tracking-wide text-text-muted bg-surface-active whitespace-nowrap shrink-0 max-w-15 truncate"
      >
        {name}
      </span>
    );
  }

  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      role="img"
      aria-label={icon.title}
      className="text-text-muted shrink-0"
    >
      <title>{icon.title}</title>
      <path d={icon.path} />
    </svg>
  );
}
