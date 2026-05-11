import { apiClient } from '../api-client';

export type CaseStatus = 'OPEN' | 'CLOSED' | 'ARCHIVED';

export interface Case {
  id: string;
  caseRef: string;
  consumerId: string;
  title: string;
  type: string;
  courtLevel?: string;
  court?: string;
  courtCity?: string;
  caseNo?: string;
  caseYear?: number;
  caseCategory?: string;
  courtCaseStatus?: string;
  judgeDesignation?: string;
  province?: string;
  district?: string;
  policeStation?: string;
  firNo?: string;
  offence?: string;
  docNo?: string;
  officeCity?: string;
  petitioner?: string;
  respondent?: string;
  status: CaseStatus;
  notes?: string;
  closedAt?: string;
  createdAt: string;
  updatedAt: string;
  consumer: { id: string; name: string };
  _count?: { tickets: number };
}

export interface CaseEvent {
  id: string;
  caseId: string;
  type: string;
  title: string;
  description?: string;
  actorUserId?: string;
  ticketId?: string;
  hearingId?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  ticket?: {
    batchNo: string;
    status: string;
    serviceCost: number | string;
    totalAmount: number | string;
    service: { name: string };
  };
}

export interface CaseTicket {
  id: string;
  batchNo: string;
  status: string;
  scheduledDate?: string;
  hearingType?: string;
  outcome?: string;
  createdAt: string;
  service: { name: string };
  [key: string]: unknown;
}

export interface CaseDocument {
  id: string;
  name?: string;
  url?: string;
  [key: string]: unknown;
}

export interface CreateCaseDto {
  consumerId: string;
  title: string;
  type: string;
  [key: string]: unknown;
}

export type CaseUpdateDto = Partial<Omit<Case, 'id' | 'consumer' | '_count' | 'createdAt' | 'updatedAt'>>;

export type CaseSummary = Record<string, unknown>;

export const casesApi = {
  createCase: (data: CreateCaseDto) => apiClient.post<Case>('/cases', data),
  
  listCases: (params?: { page?: number; limit?: number; search?: string; status?: CaseStatus; consumerId?: string; hasRecommendations?: boolean }) => {
    const qs = new URLSearchParams();
    if (params?.page) qs.append('page', params.page.toString());
    if (params?.limit) qs.append('limit', params.limit.toString());
    if (params?.search) qs.append('search', params.search);
    if (params?.status) qs.append('status', params.status);
    if (params?.consumerId) qs.append('consumerId', params.consumerId);
    if (params?.hasRecommendations) qs.append('hasRecommendations', 'true');
    return apiClient.get<{ items: Case[]; total: number; page: number; limit: number }>(`/cases?${qs.toString()}`);
  },

  getCase: (id: string) => apiClient.get<Case & { events: CaseEvent[]; tickets: CaseTicket[]; documents: CaseDocument[] }>(`/cases/${id}`),

  updateCase: (id: string, data: CaseUpdateDto) => apiClient.patch<Case>(`/cases/${id}`, data),

  updateStatus: (id: string, status: CaseStatus, notes?: string) => apiClient.patch<Case>(`/cases/${id}/status`, { status, notes }),

  deleteCase: (id: string) => apiClient.delete<{ deleted: boolean }>(`/cases/${id}`),

  getTimeline: (id: string) => apiClient.get<CaseEvent[]>(`/cases/${id}/timeline`),

  getSummary: (id: string) => apiClient.get<CaseSummary>(`/cases/${id}/summary`),

  listTickets: (caseId: string) => apiClient.get<CaseTicket[]>(`/cases/${caseId}/tickets`),

  getRecommendations: (caseId: string) =>
    apiClient.get<Array<{ next: string; priority: 1 | 2 | 3; reason?: string }>>(
      `/cases/${caseId}/recommendations`,
    ),

  getDrifts: (caseId: string) =>
    apiClient.get<Array<{
      id: string;
      field: string;
      caseValue: string;
      ticketValue: string;
      ticketId: string | null;
      detectedAt: string;
    }>>(`/cases/${caseId}/drifts`),

  resolveDrift: (caseId: string, eventId: string, source: 'CASE' | 'TICKET') =>
    apiClient.post<{ resolved: true; field: string; source: 'CASE' | 'TICKET'; chosenValue: string }>(
      `/cases/${caseId}/drifts/${eventId}/resolve`,
      { source },
    ),

  trackRecommendationClick: (caseId: string, flowKey: string, surface?: string) =>
    apiClient.post<{ tracked: true }>(
      `/cases/${caseId}/recommendations/track-click`,
      { flowKey, surface: surface ?? 'case_detail' },
    ),
};
