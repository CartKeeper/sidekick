import {
  Folder, Rocket, Lock, Settings, Globe, Package, Database, Terminal, Wrench, Zap,
  Key, Server, Cloud, Code, Box, Layers, Cpu, Briefcase, ShoppingCart, Camera,
  Smartphone, Palette, type LucideIcon,
} from 'lucide-react';

/** Selectable project icons (replaces the old emoji presets). `name` is what's stored on the project. */
export const PROJECT_ICONS: { name: string; Icon: LucideIcon }[] = [
  { name: 'folder', Icon: Folder },
  { name: 'rocket', Icon: Rocket },
  { name: 'code', Icon: Code },
  { name: 'terminal', Icon: Terminal },
  { name: 'database', Icon: Database },
  { name: 'server', Icon: Server },
  { name: 'cloud', Icon: Cloud },
  { name: 'globe', Icon: Globe },
  { name: 'lock', Icon: Lock },
  { name: 'key', Icon: Key },
  { name: 'package', Icon: Package },
  { name: 'box', Icon: Box },
  { name: 'layers', Icon: Layers },
  { name: 'cpu', Icon: Cpu },
  { name: 'zap', Icon: Zap },
  { name: 'wrench', Icon: Wrench },
  { name: 'settings', Icon: Settings },
  { name: 'briefcase', Icon: Briefcase },
  { name: 'cart', Icon: ShoppingCart },
  { name: 'camera', Icon: Camera },
  { name: 'mobile', Icon: Smartphone },
  { name: 'palette', Icon: Palette },
];

export const PROJECT_ICON_MAP: Record<string, LucideIcon> = Object.fromEntries(
  PROJECT_ICONS.map((i) => [i.name, i.Icon]),
);

export function getProjectIcon(name: string | undefined | null): LucideIcon | undefined {
  if (!name) return undefined;
  return PROJECT_ICON_MAP[name];
}
