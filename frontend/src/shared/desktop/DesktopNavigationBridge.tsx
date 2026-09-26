import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export function DesktopNavigationBridge(): null {
  const navigate = useNavigate();

  useEffect(() => window.mizanDesktop?.onNavigate((path) => navigate(path)), [navigate]);

  return null;
}
