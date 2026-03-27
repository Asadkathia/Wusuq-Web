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
  _count?: { tickets: number; hearings: number };
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
  metadata?: any;
  createdAt: string;
  ticket?: {
    batchNo: string;
    status: string;
    serviceCost: number | string;
    totalAmount: number | string;
    service: { name: string };
  };
  hearing?: {
    scheduledDate: string;
    hearingType?: string;
  };
}

export interface Hearing {
  id: string;
  caseId: string;
  scheduledDate: string;
  hearingType?: string;
  notes?: string;
  outcome?: string;
  nextDate?: string;
  createdAt: string;
  _count?: { tickets: number };
}

export interface CreateCaseDto {
  consumerId: string;
  title: string;
  type: string;
  [key: string]: any;
}

export const casesApi = {
  createCase: (data: CreateCaseDto) => apiClient.post<Case>('/cases', data),
  
  listCases: (params?: { page?: number; limit?: number; search?: string; status?: CaseStatus }) => {
    const qs = new URLSearchParams();
    if (params?.page) qs.append('page', params.page.toString());
    if (params?.limit) qs.append('limit', params.limit.toString());
    if (params?.search) qs.append('search', params.search);
    if (params?.status) qs.append('status', params.status);
    return apiClient.get<{ items: Case[]; total: number; page: number; limit: number }>(`/cases?${qs.toString()}`);
  },

  getCase: (id: string) => apiClient.get<Case & { hearings: Hearing[], events: CaseEvent[], tickets: any[], documents: any[] }>(`/cases/${id}`),
  
  updateCase: (id: string, data: any) => apiClient.patch<Case>(`/cases/${id}`, data),
  
  updateStatus: (id: string, status: CaseStatus, notes?: string) => apiClient.patch<Case>(`/cases/${id}/status`, { status, notes }),
  
  deleteCase: (id: string) => apiClient.delete<{ deleted: boolean }>(`/cases/${id}`),
  
  getTimeline: (id: string) => apiClient.get<CaseEvent[]>(`/cases/${id}/timeline`),
  
  getSummary: (id: string) => apiClient.get<any>(`/cases/${id}/summary`),
  
  createHearing: (caseId: string, data: any) => apiClient.post<Hearing>(`/cases/${caseId}/hearings`, data),
  
  listHearings: (caseId: string) => apiClient.get<Hearing[]>(`/cases/${caseId}/hearings`),
  
  updateHearing: (caseId: string, hearingId: string, data: any) => apiClient.patch<Hearing>(`/cases/${caseId}/hearings/${hearingId}`, data),
  
  deleteHearing: (caseId: string, hearingId: string) => apiClient.delete(`/cases/${caseId}/hearings/${hearingId}`),
  
  createTicket: (caseId: string, data: { serviceId: string; hearingId?: string; overrides?: any }) => apiClient.post(`/cases/${caseId}/tickets`, data),
  
  continueTicket: (caseId: string, prevId: string, data: { serviceId: string; hearingId?: string; overrides?: any }) => apiClient.post(`/cases/${caseId}/tickets/continue/${prevId}`, data),
  
  listTickets: (caseId: string) => apiClient.get<any[]>(`/cases/${caseId}/tickets`),
};
