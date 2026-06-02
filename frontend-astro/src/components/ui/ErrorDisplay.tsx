import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorDisplayProps {
  title?: string;
  message: string;
  onRetry?: () => void;
}

export default function ErrorDisplay({ 
  title = 'Error', 
  message, 
  onRetry 
}: ErrorDisplayProps) {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center">
      <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mb-4">
        <AlertTriangle className="h-8 w-8 text-red-600" />
      </div>
      <h3 className="text-lg font-semibold text-red-600 mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground max-w-md mb-4">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="inline-flex items-center px-4 py-2 rounded-md border hover:bg-accent transition-colors"
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          Coba Lagi
        </button>
      )}
    </div>
  );
}
