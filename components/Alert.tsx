import React from 'react';
import { InfoIcon, CheckCircleIcon, XCircleIcon, ExclamationTriangleIcon } from './icons';

interface AlertProps {
  type: 'error' | 'success' | 'info' | 'warning';
  title?: string;
  message: React.ReactNode;
  onClose?: () => void;
}

export function Alert({ type, title, message, onClose }: AlertProps) {
  const baseClasses = "border-l-4 p-4 my-4 rounded-md shadow-md";
  
  const typeConfig = {
    error: {
      container: "bg-red-50 border-red-500 text-red-700",
      icon: XCircleIcon,
      iconClass: "text-red-700",
    },
    success: {
      container: "bg-green-50 border-green-500 text-green-700",
      icon: CheckCircleIcon,
      iconClass: "text-green-700",
    },
    info: {
      container: "bg-blue-50 border-blue-500 text-blue-700",
      icon: InfoIcon,
      iconClass: "text-blue-700",
    },
    warning: {
      container: "bg-yellow-50 border-yellow-500 text-yellow-700",
      icon: ExclamationTriangleIcon,
      iconClass: "text-yellow-700",
    },
  };

  const IconComponent = typeConfig[type].icon;

  return (
    <div className={`${baseClasses} ${typeConfig[type].container}`} role="alert">
      <div className="flex">
        <div className="py-1">
          <IconComponent className={`h-6 w-6 ${typeConfig[type].iconClass} mr-3`} />
        </div>
        <div className="flex-grow">
          {title && <p className="font-bold">{title}</p>}
          <div className="text-sm whitespace-pre-wrap break-words">
            {message}
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="ml-auto -mx-1.5 -my-1.5 bg-transparent rounded-lg focus:ring-2 focus:ring-opacity-50 p-1.5 inline-flex h-8 w-8 items-center justify-center"
            aria-label="Dismiss"
          >
            <span className="sr-only">Dismiss</span>
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"></path>
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}