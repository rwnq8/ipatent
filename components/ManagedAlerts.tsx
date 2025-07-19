import React from 'react';
import { Alert } from './Alert';
import { sanitizeMessage } from '../services/utils';

interface ManagedAlertsProps {
  error: unknown;
  success: unknown;
  apiKeyError: boolean;
  onApiErrorClose: () => void;
  onErrorClose: () => void;
  onSuccessClose: () => void;
}

export function ManagedAlerts({
  error,
  success,
  apiKeyError,
  onApiErrorClose,
  onErrorClose,
  onSuccessClose
}: ManagedAlertsProps) {
  // Sanitize all incoming messages to prevent rendering errors
  const saneError = sanitizeMessage(error);
  const saneSuccess = sanitizeMessage(success);

  return (
    <>
      {apiKeyError && (
        <Alert
          type="error"
          title="Configuration Error"
          message="Gemini API Key (API_KEY) is not set in the environment. This application requires an API key to function."
          onClose={onApiErrorClose}
        />
      )}
      {saneError && <Alert type="error" title="An Error Occurred" message={saneError} onClose={onErrorClose} />}
      {saneSuccess && <Alert type="success" title="Success" message={saneSuccess} onClose={onSuccessClose} />}
    </>
  );
}
