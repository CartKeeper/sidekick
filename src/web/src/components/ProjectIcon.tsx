interface ProjectIconProps {
  icon: string;
  iconPath?: string;
  color: string;
  name: string;
  size?: number;
  borderRadius?: number;
}

export function ProjectIcon({
  icon,
  iconPath,
  color,
  name,
  size = 28,
  borderRadius = 8,
}: ProjectIconProps) {
  const hasImage = iconPath && iconPath.length > 0;
  const hasEmoji = icon && /\p{Emoji}/u.test(icon);
  const letter = name.charAt(0).toUpperCase();

  if (hasImage) {
    const filename = iconPath.split('/').pop();
    return (
      <img
        src={`/api/projects/icon/${filename}`}
        alt={name}
        style={{
          width: `${size}px`,
          height: `${size}px`,
          borderRadius: `${borderRadius}px`,
          objectFit: 'cover',
          flexShrink: 0,
        }}
      />
    );
  }

  return (
    <div
      style={{
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: `${borderRadius}px`,
        // DATA: color is a user-chosen project color stored in DB
        backgroundColor: `${color}22`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: hasEmoji ? `${Math.round(size * 0.54)}px` : `${Math.round(size * 0.46)}px`,
        fontWeight: 700,
        // DATA: color is a user-chosen project color stored in DB
        color: color,
        fontFamily: hasEmoji ? undefined : 'var(--font-mono, monospace)',
        flexShrink: 0,
      }}
    >
      {hasEmoji ? icon : letter}
    </div>
  );
}
