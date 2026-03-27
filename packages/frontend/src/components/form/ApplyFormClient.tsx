'use client';

import { useAuth } from '@/hooks/useAuth';
import { MultiStepForm } from '@/components/form/MultiStepForm';

export function ApplyFormClient() {
  const { token } = useAuth();

  return <MultiStepForm token={token} />;
}