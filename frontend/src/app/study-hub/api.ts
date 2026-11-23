import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { CmChapter, CmNote, CmQuiz, LeaderRow, Profile, ShopItem, WmAnswerResult, WmChapter, WmQuestionList, WmTestItem, WmTestResult } from './models';

// The Study Hub's calls. They go to the Study Hub part of the API, for signed-in students.
// The interceptor adds the institute and the sign-in, the same as every other call.
const API = `${environment.apiBase}/api/my/study-hub`;

@Injectable({ providedIn: 'root' })
export class StudyHubApi {
  private http = inject(HttpClient);

  createPlayer(name: string): Observable<Profile> {
    return this.http.post<Profile>(`${API}/players`, { name });
  }

  getPlayer(code: string): Observable<Profile> {
    return this.http.get<Profile>(`${API}/players/${encodeURIComponent(code)}`);
  }

  shop(): Observable<{ items: ShopItem[] }> {
    return this.http.get<{ items: ShopItem[] }>(`${API}/shop`);
  }

  buyItem(code: string, itemId: string): Observable<Profile> {
    return this.http.post<Profile>(`${API}/players/${encodeURIComponent(code)}/shop/buy`, { item_id: itemId });
  }

  equipItem(code: string, itemId: string): Observable<Profile> {
    return this.http.post<Profile>(`${API}/players/${encodeURIComponent(code)}/shop/equip`, { item_id: itemId });
  }

  wmChapters(): Observable<{ chapters: WmChapter[] }> {
    return this.http.get<{ chapters: WmChapter[] }>(`${API}/wm/chapters`);
  }

  wmQuestions(code: string, chapter: number): Observable<WmQuestionList> {
    return this.http.get<WmQuestionList>(`${API}/players/${encodeURIComponent(code)}/wm/chapters/${chapter}/questions`);
  }

  wmProgress(code: string): Observable<{ done: Record<string, number> }> {
    return this.http.get<{ done: Record<string, number> }>(`${API}/players/${encodeURIComponent(code)}/wm/progress`);
  }

  wmAnswer(code: string, chapter: number, questionId: string, choice: number): Observable<WmAnswerResult> {
    return this.http.post<WmAnswerResult>(`${API}/players/${encodeURIComponent(code)}/wm/answers`, {
      chapter,
      question_id: questionId,
      choice,
    });
  }

  // Student-made test: chapters and formats are chosen by the student.
  wmBuildTest(chapters: number[], formats: string[], count: number): Observable<{ items: WmTestItem[] }> {
    const params = `chapters=${chapters.join(',')}&formats=${formats.join('')}&count=${count}`;
    return this.http.get<{ items: WmTestItem[] }>(`${API}/wm/tests/build?${params}`);
  }

  wmGradeTest(items: { id: string; answer: string }[]): Observable<WmTestResult> {
    return this.http.post<WmTestResult>(`${API}/wm/tests/grade`, { items });
  }

  // Cambridge Stage 8: chapter notes, chapter quizzes and student-made tests.
  cmChapters(): Observable<{ chapters: CmChapter[] }> {
    return this.http.get<{ chapters: CmChapter[] }>(`${API}/cm/chapters`);
  }

  cmChapter(chapter: number): Observable<CmNote> {
    return this.http.get<CmNote>(`${API}/cm/chapters/${chapter}`);
  }

  cmQuiz(chapter: number): Observable<CmQuiz> {
    return this.http.get<CmQuiz>(`${API}/cm/chapters/${chapter}/quiz`);
  }

  cmBuildTest(chapters: number[], formats: string[], count: number): Observable<{ items: WmTestItem[] }> {
    const params = `chapters=${chapters.join(',')}&formats=${formats.join('')}&count=${count}`;
    return this.http.get<{ items: WmTestItem[] }>(`${API}/cm/tests/build?${params}`);
  }

  cmGradeTest(items: { id: string; answer: string }[]): Observable<WmTestResult> {
    return this.http.post<WmTestResult>(`${API}/cm/tests/grade`, { items });
  }

  leaderboard(limit = 10): Observable<{ rows: LeaderRow[] }> {
    return this.http.get<{ rows: LeaderRow[] }>(`${API}/leaderboard?limit=${limit}`);
  }
}
