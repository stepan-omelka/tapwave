import { HttpClient } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { Observable } from 'rxjs';
import { BeatmapDetail, StartPlayResponse, SubmitScoreRequest, SubmitScoreResponse } from './models';

/** Calls that change state or are needed imperatively; read-only lists use httpResource in the pages. */
@Service()
export class ApiService {
  private readonly http = inject(HttpClient);

  beatmap(id: number): Observable<BeatmapDetail> {
    return this.http.get<BeatmapDetail>(`/api/beatmaps/${id}`);
  }

  startPlay(beatmapId: number): Observable<StartPlayResponse> {
    return this.http.post<StartPlayResponse>(`/api/beatmaps/${beatmapId}/plays`, null);
  }

  submitScore(playId: string, request: SubmitScoreRequest): Observable<SubmitScoreResponse> {
    return this.http.post<SubmitScoreResponse>(`/api/plays/${playId}/score`, request);
  }
}
