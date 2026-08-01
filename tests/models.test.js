import { describe, it, expect, beforeEach } from 'vitest';
import { createAppContext } from './helpers/loadApp.js';

let Models, DB, Utils;

beforeEach(() => {
  ({ Models, DB, Utils } = createAppContext());
});

describe('createWork', () => {
  it('seeds the default relationship tags for the new work', async () => {
    const work = await Models.createWork({ title: '테스트 작품' });
    const tags = await Models.getRelationshipTags(work.id);
    expect(tags.length).toBe(Models.DEFAULT_RELATIONSHIP_TAGS.length);
    expect(tags.map((t) => t.label)).toEqual(expect.arrayContaining(['가족', '연인', '기타']));
  });

  it('defaults length to long and accepts a custom color', async () => {
    const work = await Models.createWork({ title: '작품', color: '#123456' });
    expect(work.length).toBe('long');
    expect(work.color).toBe('#123456');
  });

  it('defaults format to book (단행본) with no genre', async () => {
    const work = await Models.createWork({ title: '작품' });
    expect(work.format).toBe('book');
    expect(work.genre).toBeNull();
  });

  it('accepts webnovel format and a genre key', async () => {
    const work = await Models.createWork({ title: '웹소설', format: 'webnovel', genre: 'fantasy' });
    expect(work.format).toBe('webnovel');
    expect(work.genre).toBe('fantasy');
  });

  it('new chapters start with no serialization date', async () => {
    const work = await Models.createWork({ title: '작품' });
    const chapter = await Models.createChapter(work.id);
    expect(chapter.serializedAt).toBeNull();
  });
});

describe('applyGenreTemplate', () => {
  it('seeds the setting-note stubs defined for the genre', async () => {
    const work = await Models.createWork({ title: '판타지 작품', format: 'webnovel', genre: 'fantasy' });
    await Models.applyGenreTemplate(work.id, 'fantasy');
    const notes = await DB.getAllByIndex('settingNotes', 'workId', work.id);
    expect(notes.length).toBe(Models.GENRE_TEMPLATES.fantasy.notes.length);
    expect(notes.map((n) => n.title)).toEqual(expect.arrayContaining(['세계관 개요', '마법/능력 체계']));
  });

  it('does nothing for an unknown genre key', async () => {
    const work = await Models.createWork({ title: '작품' });
    await Models.applyGenreTemplate(work.id, 'not-a-real-genre');
    expect(await DB.getAllByIndex('settingNotes', 'workId', work.id)).toEqual([]);
  });
});

describe('submissions', () => {
  it('creates a submission with sensible defaults and lists newest-first', async () => {
    const work = await Models.createWork({ title: '투고 작품' });
    await Models.createSubmission(work.id, { publisher: '출판사 A', date: '2026-01-01' });
    await Models.createSubmission(work.id, { publisher: '출판사 B', date: '2026-06-01' });
    const subs = await Models.getSubmissions(work.id);
    expect(subs).toHaveLength(2);
    expect(subs[0].publisher).toBe('출판사 B');
    expect(subs[0].status).toBe('검토중');
  });

  it('updates status and deletes a submission', async () => {
    const work = await Models.createWork({ title: '투고 작품2' });
    const sub = await Models.createSubmission(work.id, { publisher: '출판사 C' });
    await Models.updateSubmission(sub.id, { status: '합격' });
    expect((await DB.get('submissions', sub.id)).status).toBe('합격');
    await Models.deleteSubmission(sub.id);
    expect(await DB.get('submissions', sub.id)).toBeUndefined();
  });

  it('deleteWork also removes its submissions', async () => {
    const work = await Models.createWork({ title: '투고 작품3' });
    await Models.createSubmission(work.id, { publisher: '출판사 D' });
    await Models.deleteWork(work.id);
    expect(await Models.getSubmissions(work.id)).toEqual([]);
  });
});

describe('deleteWork cascade', () => {
  it('removes chapters, characters, relationship tags, and character groups scoped to the work', async () => {
    const work = await Models.createWork({ title: '삭제될 작품' });
    const chapter = await Models.createChapter(work.id);
    const scene = await Models.createScene(chapter.id, work.id);
    const char = await Models.createCharacter(work.id, { name: '주인공' });
    const group = await Models.createCharacterGroup(work.id, { name: '그룹', memberIds: [char.id] });

    await Models.deleteWork(work.id);

    expect(await DB.get('works', work.id)).toBeUndefined();
    expect(await DB.get('chapters', chapter.id)).toBeUndefined();
    expect(await DB.get('scenes', scene.id)).toBeUndefined();
    expect(await DB.get('characters', char.id)).toBeUndefined();
    expect(await DB.get('characterGroups', group.id)).toBeUndefined();
    expect(await Models.getRelationshipTags(work.id)).toEqual([]);
  });
});

describe('relationship tags', () => {
  it('supports multiple hashtags per relationship and resolves them back', async () => {
    const work = await Models.createWork({ title: '관계 작품' });
    const alice = await Models.createCharacter(work.id, { name: '앨리스' });
    const bob = await Models.createCharacter(work.id, { name: '밥' });
    const tags = await Models.getRelationshipTags(work.id);
    const family = tags.find((t) => t.label === '가족');
    const rival = tags.find((t) => t.label === '라이벌');

    await Models.addRelationship(alice.id, { targetId: bob.id, tagIds: [family.id, rival.id] });
    const updated = await DB.get('characters', alice.id);
    expect(updated.relationships).toHaveLength(1);
    expect(Models.relationshipTagIds(updated.relationships[0])).toEqual([family.id, rival.id]);
  });

  it('reads legacy single-`type` relationships as a one-item tagIds list', () => {
    expect(Models.relationshipTagIds({ type: 'family' })).toEqual(['family']);
    expect(Models.relationshipTagIds({ tagIds: ['a', 'b'] })).toEqual(['a', 'b']);
    expect(Models.relationshipTagIds({})).toEqual([]);
  });

  it('deleting a tag strips it from every relationship that referenced it, without touching other tags', async () => {
    const work = await Models.createWork({ title: '태그 삭제 작품' });
    const alice = await Models.createCharacter(work.id, { name: '앨리스' });
    const bob = await Models.createCharacter(work.id, { name: '밥' });
    const tags = await Models.getRelationshipTags(work.id);
    const family = tags.find((t) => t.label === '가족');
    const rival = tags.find((t) => t.label === '라이벌');
    await Models.addRelationship(alice.id, { targetId: bob.id, tagIds: [family.id, rival.id] });

    await Models.deleteRelationshipTag(family.id);

    const updated = await DB.get('characters', alice.id);
    expect(Models.relationshipTagIds(updated.relationships[0])).toEqual([rival.id]);
    expect(await Models.getRelationshipTags(work.id)).toHaveLength(Models.DEFAULT_RELATIONSHIP_TAGS.length - 1);
  });
});

describe('migrateLegacyData', () => {
  it('converts legacy single-`type` relationships to tagIds, reusing the matching seeded tag by label', async () => {
    const work = await Models.createWork({ title: '레거시 작품' });
    const alice = await Models.createCharacter(work.id, { name: '앨리스' });
    const bob = await Models.createCharacter(work.id, { name: '밥' });
    // Simulate pre-migration data: relationships stored with `type` instead of `tagIds`.
    await DB.put('characters', { ...alice, relationships: [{ targetId: bob.id, type: 'family', label: '', note: '' }] });

    await Models.migrateLegacyData();

    const migrated = await DB.get('characters', alice.id);
    const rel = migrated.relationships[0];
    expect(rel.type).toBeUndefined();
    expect(Models.relationshipTagIds(rel)).toHaveLength(1);

    const familyTag = (await Models.getRelationshipTags(work.id)).find((t) => t.label === '가족');
    expect(Models.relationshipTagIds(rel)).toEqual([familyTag.id]);
    // Migration must not spawn a duplicate '가족' tag alongside the one seeded at work creation.
    expect((await Models.getRelationshipTags(work.id)).filter((t) => t.label === '가족')).toHaveLength(1);
  });

  it('is idempotent: running it twice does not double up tags or touch already-migrated relationships', async () => {
    const work = await Models.createWork({ title: '멱등 작품' });
    const alice = await Models.createCharacter(work.id, { name: '앨리스' });
    const bob = await Models.createCharacter(work.id, { name: '밥' });
    await DB.put('characters', { ...alice, relationships: [{ targetId: bob.id, type: 'rival', label: '', note: '' }] });

    await Models.migrateLegacyData();
    const tagCountAfterFirst = (await Models.getRelationshipTags(work.id)).length;
    await Models.migrateLegacyData();
    const tagCountAfterSecond = (await Models.getRelationshipTags(work.id)).length;

    expect(tagCountAfterSecond).toBe(tagCountAfterFirst);
  });

  it('leaves relationships that already use tagIds untouched', async () => {
    const work = await Models.createWork({ title: '이미 이관된 작품' });
    const alice = await Models.createCharacter(work.id, { name: '앨리스' });
    const bob = await Models.createCharacter(work.id, { name: '밥' });
    const tags = await Models.getRelationshipTags(work.id);
    await Models.addRelationship(alice.id, { targetId: bob.id, tagIds: [tags[0].id] });

    await Models.migrateLegacyData();

    const after = await DB.get('characters', alice.id);
    expect(after.relationships[0].tagIds).toEqual([tags[0].id]);
  });
});

describe('character groups', () => {
  // Membership lives on the group's own memberIds array (unlike memo canvas groups,
  // characters don't carry a back-reference), so deleting a group should never touch
  // its member characters.
  it('deleting a group leaves its member characters untouched', async () => {
    const work = await Models.createWork({ title: '그룹 작품' });
    const char = await Models.createCharacter(work.id, { name: '캐릭터' });
    const group = await Models.createCharacterGroup(work.id, { name: '기사단', memberIds: [char.id] });

    await Models.deleteCharacterGroup(group.id);

    const stillThere = await DB.get('characters', char.id);
    expect(stillThere).toBeDefined();
    expect(stillThere.name).toBe('캐릭터');
    expect(await DB.get('characterGroups', group.id)).toBeUndefined();
  });
});

describe('memo canvas', () => {
  it('creates memos with default canvas placement fields', async () => {
    const memo = await Models.createMemo('work-1', { content: '아이디어' });
    expect(memo.w).toBe(220);
    expect(memo.h).toBe(140);
    expect(memo.x).toBeNull();
    expect(memo.groupId).toBeNull();
  });

  it('deleting a memo also deletes connections that reference it', async () => {
    const work = await Models.createWork({ title: '메모 작품' });
    const a = await Models.createMemo(work.id, { content: 'A' });
    const b = await Models.createMemo(work.id, { content: 'B' });
    const conn = await Models.createMemoConnection(work.id, { fromMemoId: a.id, toMemoId: b.id });

    await Models.deleteMemo(a.id);

    expect(await DB.get('memoConnections', conn.id)).toBeUndefined();
    expect(await DB.get('memos', b.id)).toBeDefined();
  });

  it('deleting a memo group clears groupId on its members without deleting them', async () => {
    const work = await Models.createWork({ title: '메모 그룹 작품' });
    const group = await Models.createMemoGroup(work.id, { name: '아이디어 뭉치' });
    const memo = await Models.createMemo(work.id, { content: '메모', groupId: group.id });

    await Models.deleteMemoGroup(group.id);

    const updated = await DB.get('memos', memo.id);
    expect(updated.groupId).toBeNull();
  });
});

describe('schedules', () => {
  it('defaults to all-day with no end date, and accepts a timed range', async () => {
    const work = await Models.createWork({ title: '일정 작품' });
    const allDay = await Models.createSchedule(work.id, { title: '마감', date: '2026-01-01' });
    expect(allDay.allDay).toBe(true);
    expect(allDay.startTime).toBeNull();
    expect(allDay.endDate).toBeNull();

    const timed = await Models.createSchedule(work.id, {
      title: '북토크', date: '2026-01-01', endDate: '2026-01-03', allDay: false, startTime: '14:00', endTime: '16:00',
    });
    expect(timed.endDate).toBe('2026-01-03');
    expect(timed.startTime).toBe('14:00');
    expect(timed.endTime).toBe('16:00');
  });
});

describe('missions', () => {
  it('custom missions never auto-track — done just mirrors the manual completed flag', async () => {
    const work = await Models.createWork({ title: '미션 작품' });
    const mission = await Models.createMission(work.id, { title: '챕터 완결', kind: 'custom' });
    expect(await Models.getMissionProgress(mission)).toEqual({ progress: null, current: null, target: null, done: false });

    await Models.updateMission(mission.id, { completed: true });
    const updated = await DB.get('missions', mission.id);
    expect((await Models.getMissionProgress(updated)).done).toBe(true);
  });

  it('streak missions count consecutive today-backward days meeting the daily target', async () => {
    const work = await Models.createWork({ title: '스트릭 작품' });
    for (let i = 0; i < 3; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      await DB.add('writingLog', { id: DB.uuid(), workId: work.id, date: Utils.dateStr(d), chars: 600 });
    }
    const mission = await Models.createMission(work.id, { title: '3일 연속 500자', kind: 'streak', targetValue: 500, targetDays: 3, startDate: '2000-01-01' });
    const result = await Models.getMissionProgress(mission);
    expect(result.current).toBe(3);
    expect(result.progress).toBe(1);
    expect(result.done).toBe(true);
  });

  it('streak stops at the first day (counting backward from today) under target', async () => {
    const work = await Models.createWork({ title: '스트릭 중단 작품' });
    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
    // Today meets target; yesterday has no entry (breaks the streak); two days ago
    // meets target too but is unreachable once the streak has already broken.
    await DB.add('writingLog', { id: DB.uuid(), workId: work.id, date: Utils.todayStr(), chars: 600 });
    await DB.add('writingLog', { id: DB.uuid(), workId: work.id, date: Utils.dateStr(twoDaysAgo), chars: 600 });
    const mission = await Models.createMission(work.id, { title: '스트릭', kind: 'streak', targetValue: 500, targetDays: 5, startDate: '2000-01-01' });
    const result = await Models.getMissionProgress(mission);
    expect(result.current).toBe(1);
    expect(result.done).toBe(false);
  });

  it('streak with no targetDays set never reports a percentage, just the raw count', async () => {
    const work = await Models.createWork({ title: '목표일수 없는 스트릭' });
    await DB.add('writingLog', { id: DB.uuid(), workId: work.id, date: Utils.todayStr(), chars: 600 });
    const mission = await Models.createMission(work.id, { title: '기록만', kind: 'streak', targetValue: 500, startDate: '2000-01-01' });
    const result = await Models.getMissionProgress(mission);
    expect(result.current).toBe(1);
    expect(result.progress).toBeNull();
    expect(result.target).toBeNull();
  });

  it('total missions sum writingLog chars within [startDate, endDate] only', async () => {
    const work = await Models.createWork({ title: '누적 작품' });
    await DB.add('writingLog', { id: DB.uuid(), workId: work.id, date: '2026-03-01', chars: 3000 });
    await DB.add('writingLog', { id: DB.uuid(), workId: work.id, date: '2026-03-02', chars: 4000 });
    await DB.add('writingLog', { id: DB.uuid(), workId: work.id, date: '2026-02-28', chars: 9999 }); // outside range
    const mission = await Models.createMission(work.id, { title: '3월 첫주 만자', kind: 'total', targetValue: 10000, startDate: '2026-03-01', endDate: '2026-03-07' });
    const result = await Models.getMissionProgress(mission);
    expect(result.current).toBe(7000);
    expect(result.progress).toBeCloseTo(0.7);
    expect(result.done).toBe(false);
  });
});
