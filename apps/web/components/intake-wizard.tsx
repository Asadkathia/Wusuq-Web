'use client';

import { useMemo, useState } from 'react';
import type { IntakeField, IntakeFlow } from '@/lib/intake-flows';

type IntakeWizardProps = {
  title: string;
  flows: IntakeFlow[];
};

type TicketDraft = {
  draftId?: string;
  flow: string;
  consumerId: string;
  serviceId: string;
  step: number;
  payload: Record<string, string>;
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000/api';

async function apiPost(path: string, body: unknown) {
  const token =
    typeof window !== 'undefined' ? localStorage.getItem('wusuq_access_token') : null;

  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Request failed (${response.status})`);
  }

  return response.json();
}

async function uploadDocuments(ticketId: string, files: File[]) {
  const token =
    typeof window !== 'undefined' ? localStorage.getItem('wusuq_access_token') : null;

  for (const file of files) {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${API_BASE}/tickets/${ticketId}/documents/upload`, {
      method: 'POST',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Upload failed for ${file.name}`);
    }
  }
}

function hasValue(value: string | undefined) {
  return Boolean(value && value.trim().length > 0);
}

function renderField(
  field: IntakeField,
  value: string,
  onChange: (key: string, value: string) => void,
) {
  if (field.type === 'textarea') {
    return (
      <textarea
        className="w-full rounded border border-slate-300 p-2"
        rows={4}
        value={value}
        onChange={(event) => onChange(field.key, event.target.value)}
      />
    );
  }

  if (field.type === 'select') {
    return (
      <select
        className="w-full rounded border border-slate-300 p-2"
        value={value}
        onChange={(event) => onChange(field.key, event.target.value)}
      >
        <option value="">Select</option>
        {(field.options ?? []).map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  }

  return (
    <input
      className="w-full rounded border border-slate-300 p-2"
      type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
      value={value}
      onChange={(event) => onChange(field.key, event.target.value)}
    />
  );
}

export function IntakeWizard({ title, flows }: IntakeWizardProps) {
  const [draft, setDraft] = useState<TicketDraft>({
    flow: flows[0]?.key ?? '',
    consumerId: '',
    serviceId: '',
    step: 1,
    payload: {},
  });
  const [files, setFiles] = useState<File[]>([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const selectedFlow = useMemo(
    () => flows.find((flow) => flow.key === draft.flow) ?? flows[0],
    [draft.flow, flows],
  );

  const totalSteps = selectedFlow?.steps.length ?? 1;
  const activeStep = (selectedFlow?.steps[draft.step - 1] ?? selectedFlow?.steps[0]) ?? null;

  const setField = (field: keyof TicketDraft, value: string | number) => {
    setDraft((current) => ({ ...current, [field]: value }));
  };

  const setPayloadField = (key: string, value: string) => {
    setDraft((current) => ({
      ...current,
      payload: {
        ...current.payload,
        [key]: value,
      },
    }));
  };

  const validateCurrentStep = () => {
    if (!activeStep) {
      return true;
    }

    const requiredField = activeStep.fields.find(
      (field) => field.required && !hasValue(draft.payload[field.key]),
    );

    if (requiredField) {
      setMessage(`Required field missing: ${requiredField.label}`);
      return false;
    }

    return true;
  };

  const saveDraft = async () => {
    if (!selectedFlow) {
      setMessage('No intake flow configured');
      return;
    }

    setLoading(true);
    setMessage('Saving draft...');
    try {
      const result = await apiPost('/tickets/intake-drafts', {
        draftId: draft.draftId,
        flow: draft.flow,
        consumerId: draft.consumerId,
        serviceId: draft.serviceId,
        step: draft.step,
        payload: draft.payload,
      });

      setDraft((current) => ({ ...current, draftId: result.id }));
      setMessage('Draft saved');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Draft save failed');
    } finally {
      setLoading(false);
    }
  };

  const submitTicket = async () => {
    if (!selectedFlow) {
      setMessage('No intake flow configured');
      return;
    }

    if (!validateCurrentStep()) {
      return;
    }

    setLoading(true);
    setMessage('Submitting ticket...');
    try {
      const ticket = await apiPost(selectedFlow.endpoint, {
        consumerId: draft.consumerId,
        serviceId: draft.serviceId,
        serviceCity:
          draft.payload.select_court_city ??
          draft.payload.select_city ??
          draft.payload.select_district ??
          '',
        caseType: draft.payload.case_type ?? draft.payload.offence ?? draft.payload.title ?? '',
        payload: {
          ...draft.payload,
          source: 'next-web-intake',
        },
      });

      if (files.length > 0) {
        await uploadDocuments(ticket.id, files);
      }

      setMessage('Ticket created successfully');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Ticket creation failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6">
      <h2 className="text-2xl font-semibold">{title}</h2>
      <p className="mt-2 text-sm text-slate-600">
        Step {draft.step} of {totalSteps}
        {activeStep ? ` - ${activeStep.title}` : ''}
      </p>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span>Flow</span>
          <select
            className="w-full rounded border border-slate-300 p-2"
            value={draft.flow}
            onChange={(event) => {
              setField('flow', event.target.value);
              setField('step', 1);
            }}
          >
            {flows.map((flow) => (
              <option key={flow.key} value={flow.key}>
                {flow.label}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1 text-sm">
          <span>Consumer ID</span>
          <input
            className="w-full rounded border border-slate-300 p-2"
            value={draft.consumerId}
            onChange={(event) => setField('consumerId', event.target.value)}
          />
        </label>

        <label className="space-y-1 text-sm">
          <span>Service ID</span>
          <input
            className="w-full rounded border border-slate-300 p-2"
            value={draft.serviceId}
            onChange={(event) => setField('serviceId', event.target.value)}
          />
        </label>
      </div>

      {activeStep ? (
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {activeStep.fields.map((field) => (
            <label key={field.key} className="space-y-1 text-sm">
              <span>
                {field.label}
                {field.required ? ' *' : ''}
              </span>
              {renderField(field, draft.payload[field.key] ?? '', setPayloadField)}
            </label>
          ))}

          {draft.step === totalSteps ? (
            <label className="space-y-1 text-sm md:col-span-2">
              <span>Upload Documents</span>
              <input
                type="file"
                multiple
                className="w-full rounded border border-slate-300 p-2"
                onChange={(event) =>
                  setFiles(Array.from(event.target.files ?? []).filter(Boolean))
                }
              />
            </label>
          ) : null}
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50"
          onClick={() => setField('step', Math.max(1, draft.step - 1))}
          disabled={loading || draft.step === 1}
        >
          Previous
        </button>
        <button
          type="button"
          className="rounded bg-slate-700 px-4 py-2 text-sm text-white disabled:opacity-50"
          onClick={() => {
            if (!validateCurrentStep()) {
              return;
            }
            setField('step', Math.min(totalSteps, draft.step + 1));
          }}
          disabled={loading || draft.step === totalSteps}
        >
          Next
        </button>
        <button
          type="button"
          className="rounded bg-blue-700 px-4 py-2 text-sm text-white disabled:opacity-50"
          onClick={saveDraft}
          disabled={loading}
        >
          Save Draft
        </button>
        <button
          type="button"
          className="rounded bg-emerald-700 px-4 py-2 text-sm text-white disabled:opacity-50"
          onClick={submitTicket}
          disabled={loading}
        >
          Submit Ticket
        </button>
      </div>

      {message ? <p className="mt-4 text-sm text-slate-700">{message}</p> : null}
    </section>
  );
}
