interface EmptyStateProps {
  icon?: string;
  title: string;
  description?: string;
  action?: {
    label: string;
    href: string;
  };
}

export default function EmptyState({ icon = '📦', title, description, action }: EmptyStateProps) {
  return (
    <div className="text-center py-12 px-4">
      <div className="text-4xl mb-4">{icon}</div>
      <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
      {description && (
        <p className="text-sm text-muted-foreground mb-4 max-w-sm mx-auto">{description}</p>
      )}
      {action && (
        <a
          href={action.href}
          className="inline-block px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90 text-sm"
        >
          {action.label}
        </a>
      )}
    </div>
  );
}
