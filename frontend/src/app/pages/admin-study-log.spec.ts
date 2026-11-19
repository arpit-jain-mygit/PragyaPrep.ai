import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { API, all, el, sessionFor, settle, setupTestBed } from '../testing';
import { AdminStudyLog } from './admin-study-log';

function row(overrides: object = {}) {
  return {
    id: 'r1', created_at: '2027-01-15T08:00:00+05:30', question: 'Which port is a natural harbour?',
    best_coverage: 0.32, matches: 2, answered: false,
    sources: [{ course_id: 'c1', course: 'CUET', subject: 'Geography', topic: 'Ports', subtopic: 'Ports table', file_id: 'f1', file: 'Geography notes', page: 2 }],
    ...overrides,
  };
}

const LIST = `${API}/api/admin/study-log?filter=all&show_student=false&sort=newest`;

async function open(rows: object[] = [row()]) {
  const env = setupTestBed();
  env.sessions.save(sessionFor('tenant_admin'));
  const fixture = TestBed.createComponent(AdminStudyLog);
  fixture.detectChanges();
  env.http.expectOne(LIST).flush({ rows });
  await settle(fixture);
  return { ...env, fixture };
}

function choose(fixture: Parameters<typeof el>[0], selector: string, value: string) {
  const field = el(fixture, selector) as HTMLSelectElement;
  field.value = value;
  field.dispatchEvent(new Event('change'));
}

describe('AdminStudyLog', () => {
  it('lists the question with its best match as a meter and a percentage, and hides students by default', async () => {
    const env = await open();
    expect(all(env.fixture, '#log tbody tr').length).toBe(1);
    expect(el(env.fixture, '#log').textContent).toContain('Which port is a natural harbour?');
    expect(el(env.fixture, '.meter-value').textContent).toContain('32%');
    expect(el(env.fixture, '.meter-fill').className).toContain('mid');
    expect(el(env.fixture, '#log').textContent).not.toContain('Student');
  });

  it('colours the meter red below 30%, amber up to 75%, and green from 75%', async () => {
    const env = await open([
      row({ id: 'a', best_coverage: 0.1 }),
      row({ id: 'b', best_coverage: 0.5 }),
      row({ id: 'c', best_coverage: 0.8 }),
    ]);
    const fills = all(env.fixture, '.meter-fill').map((fill) => fill.className);
    expect(fills[0]).toContain('low');
    expect(fills[1]).toContain('mid');
    expect(fills[2]).toContain('high');
  });

  it('shows the course, topic, subtopic and an open button for each passage', async () => {
    const env = await open();
    const text = el(env.fixture, '#log').textContent ?? '';
    expect(text).toContain('CUET › Ports › Ports table');
    expect(el(env.fixture, '.source button').textContent).toContain('Geography notes, page 2');
  });

  it('shows an empty message when nothing is logged', async () => {
    const env = await open([]);
    expect(el(env.fixture, '#log-empty').textContent).toContain('No questions here yet');
  });

  it('asks the server for not-covered questions when the filter changes', async () => {
    const env = await open();
    choose(env.fixture, '#filter', 'not_covered');
    env.http.expectOne(`${API}/api/admin/study-log?filter=not_covered&show_student=false&sort=newest`).flush({ rows: [] });
    await settle(env.fixture);
    expect(el(env.fixture, '#log-empty').textContent).toContain('No questions here yet');
  });

  it('asks for matches below 75% when that option is chosen', async () => {
    const env = await open();
    choose(env.fixture, '#below', '0.75');
    env.http.expectOne(`${API}/api/admin/study-log?filter=all&show_student=false&sort=newest&below=0.75`).flush({ rows: [] });
    await settle(env.fixture);
  });

  it('lists worst matches first when that order is chosen', async () => {
    const env = await open();
    choose(env.fixture, '#sort', 'worst');
    env.http.expectOne(`${API}/api/admin/study-log?filter=all&show_student=false&sort=worst`).flush({ rows: [] });
    await settle(env.fixture);
  });

  it('shows the student name and email only when the admin ticks the box', async () => {
    const env = await open();
    const box = el(env.fixture, '#show-student') as HTMLInputElement;
    box.checked = true;
    box.dispatchEvent(new Event('change'));
    env.http.expectOne(`${API}/api/admin/study-log?filter=all&show_student=true&sort=newest`).flush({
      rows: [row({ student_name: 'Asha Rao', student_email: 'asha@example.com' })],
    });
    await settle(env.fixture);
    expect(el(env.fixture, '#log').textContent).toContain('Student');
    expect(el(env.fixture, '#log').textContent).toContain('Asha Rao');
    expect(el(env.fixture, '#log').textContent).toContain('asha@example.com');
  });

  it('reloads the list when the refresh button is pressed', async () => {
    const env = await open();
    (el(env.fixture, '#refresh') as HTMLButtonElement).click();
    env.http.expectOne(LIST).flush({ rows: [row({ id: 'new' })] });
    await settle(env.fixture);
    expect(all(env.fixture, '#log tbody tr').length).toBe(1);
  });
});
