import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { API, all, el, sessionFor, settle, setupTestBed, text, type } from '../testing';
import { AdminStudyLog } from './admin-study-log';

function row(overrides: object = {}) {
  return {
    id: 'r1', created_at: '2027-01-15T08:00:00+05:30', question: 'Which port is a natural harbour?',
    best_coverage: 0.32, matches: 2, answered: false,
    sources: [{ course_id: 'c1', course: 'CUET', subject: 'Geography', topic: 'Ports', subtopic: 'Ports table', file_id: 'f1', file: 'Geography notes', page: 2 }],
    ...overrides,
  };
}

const LIST = `${API}/api/admin/study-log?match=all&show_student=false&sort=newest&limit=25`;

async function open(rows: object[] = [row()]) {
  const env = setupTestBed();
  env.sessions.save(sessionFor('tenant_admin'));
  const fixture = TestBed.createComponent(AdminStudyLog);
  fixture.detectChanges();
  env.http.expectOne(LIST).flush({ rows });
  await settle(fixture);
  return { ...env, fixture };
}

function choose(fixture: Parameters<typeof type>[0], selector: string, value: string) {
  type(fixture, selector, value);
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

  it('keeps the coursework out of the table, behind a button that shows how many sources there are', async () => {
    const env = await open();
    expect(el(env.fixture, '#log').textContent).not.toContain('CUET › Ports › Ports table');
    expect(el(env.fixture, '#log').textContent).toContain('View 1 source');
  });

  it('opens the coursework in a popup with the course, topic, subtopic and an open button, and closes it', async () => {
    const env = await open();
    (el(env.fixture, '#log tbody button') as HTMLButtonElement).click();
    env.fixture.detectChanges();
    const dialog = el(env.fixture, '#sources-dialog').textContent ?? '';
    expect(dialog).toContain('CUET › Ports › Ports table');
    expect(dialog).toContain('Geography notes, page 2');
    (el(env.fixture, '#close-sources') as HTMLButtonElement).click();
    env.fixture.detectChanges();
    expect(all(env.fixture, '#sources-dialog').length).toBe(0);
  });

  it('shows an empty message when nothing is logged', async () => {
    const env = await open([]);
    expect(el(env.fixture, '#log-empty').textContent).toContain('No questions here yet');
  });

  it('asks the server for matches under 75% when that option is chosen', async () => {
    const env = await open();
    choose(env.fixture, '#match', 'under_75');
    env.http.expectOne(`${API}/api/admin/study-log?match=under_75&show_student=false&sort=newest&limit=25`).flush({ rows: [] });
    await settle(env.fixture);
    expect(el(env.fixture, '#log-empty').textContent).toContain('No questions here yet');
  });

  it('asks the server for matches under 30% when that option is chosen', async () => {
    const env = await open();
    choose(env.fixture, '#match', 'under_30');
    env.http.expectOne(`${API}/api/admin/study-log?match=under_30&show_student=false&sort=newest&limit=25`).flush({ rows: [] });
    await settle(env.fixture);
  });

  it('lists worst matches first when that order is chosen', async () => {
    const env = await open();
    choose(env.fixture, '#sort', 'worst');
    env.http.expectOne(`${API}/api/admin/study-log?match=all&show_student=false&sort=worst&limit=25`).flush({ rows: [] });
    await settle(env.fixture);
  });

  it('shows the student name and email only when the admin ticks the box', async () => {
    const env = await open();
    const box = el(env.fixture, '#show-student') as HTMLInputElement;
    box.checked = true;
    box.dispatchEvent(new Event('change'));
    env.http.expectOne(`${API}/api/admin/study-log?match=all&show_student=true&sort=newest&limit=25`).flush({
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

  it('adds the next page to the bottom of the table when the admin scrolls near the end', async () => {
    const env = setupTestBed();
    env.sessions.save(sessionFor('tenant_admin'));
    const fixture = TestBed.createComponent(AdminStudyLog);
    fixture.detectChanges();
    env.http.expectOne(LIST).flush({ rows: [row({ id: 'a' })] }, { headers: { 'X-Next-Cursor': '1' } });
    await settle(fixture);
    expect(all(fixture, '#sentinel').length).toBe(1);
    expect(text(fixture)).not.toContain('Load more');

    const more = fixture.componentInstance.loadMore();
    env.http.expectOne(`${API}/api/admin/study-log?match=all&show_student=false&sort=newest&limit=25&before=1`)
      .flush({ rows: [row({ id: 'b' })] }, { headers: {} });
    await more;
    fixture.detectChanges();
    expect(all(fixture, '#log tbody tr').length).toBe(2);
    expect(all(fixture, '#sentinel').length).toBe(0);
  });
});

