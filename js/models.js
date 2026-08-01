// Entity factories + higher level operations built on top of DB
const Models = {
  LENGTH_LABELS: { long: '장편', medium: '중편', short: '단편' },
  FORMAT_LABELS: { book: '단행본', webnovel: '웹소설' },

  // Starter setting-note stubs per genre — a lightweight planning scaffold the
  // author can edit or delete freely, not a rigid template.
  GENRE_TEMPLATES: {
    fantasy: { label: '판타지', notes: [
      { title: '세계관 개요', category: '세계관' },
      { title: '마법/능력 체계', category: '규칙/마법체계' },
      { title: '주요 세력', category: '조직/세력' },
    ]},
    romance: { label: '로맨스', notes: [
      { title: '두 주인공의 첫 만남', category: '역사/사건' },
      { title: '관계의 장애물', category: '일반' },
    ]},
    murim: { label: '무협', notes: [
      { title: '무림 세력도', category: '조직/세력' },
      { title: '무공/내공 체계', category: '규칙/마법체계' },
      { title: '시대적 배경', category: '세계관' },
    ]},
    modern_fantasy: { label: '현대판타지', notes: [
      { title: '현실과 다른 설정', category: '세계관' },
      { title: '각성/능력 체계', category: '규칙/마법체계' },
    ]},
    mystery: { label: '미스터리·스릴러', notes: [
      { title: '사건 개요', category: '역사/사건' },
      { title: '용의자/단서 정리', category: '일반' },
    ]},
    sf: { label: 'SF', notes: [
      { title: '기술/과학적 설정', category: '규칙/마법체계' },
      { title: '세계관 연표', category: '역사/사건' },
    ]},
  },

  async applyGenreTemplate(workId, genreKey) {
    const genre = Models.GENRE_TEMPLATES[genreKey];
    if (!genre) return;
    for (const n of genre.notes) {
      await Models.createSettingNote(workId, { title: n.title, category: n.category });
    }
  },

  async createWork({ title, description = '', color = '#6c5ce7', length = 'long', format = 'book', genre = null }) {
    const now = new Date().toISOString();
    const work = {
      id: DB.uuid(),
      title: title || '제목 없는 작품',
      description,
      color,
      length, // 'long' (장편) | 'medium' (중편) | 'short' (단편) — 단행본(format:'book') 기준 분류
      format, // 'book' (단행본) | 'webnovel' (웹소설)
      genre, // GENRE_TEMPLATES 키 또는 null
      penName: '',
      avatarDataUrl: null,
      targetTotalChars: 0,
      targetDate: null,
      dailyGoalChars: 0,
      weeklyGoalChars: 0,
      createdAt: now,
      updatedAt: now,
    };
    await DB.add('works', work);
    for (const t of Models.DEFAULT_RELATIONSHIP_TAGS) {
      await DB.add('relationshipTags', {
        id: DB.uuid(),
        workId: work.id,
        label: t.label,
        color: t.color,
        createdAt: now,
      });
    }
    return work;
  },

  async updateWork(id, patch) {
    const work = await DB.get('works', id);
    if (!work) return null;
    Object.assign(work, patch, { updatedAt: new Date().toISOString() });
    await DB.put('works', work);
    return work;
  },

  async deleteWork(id) {
    const chapters = await DB.getAllByIndex('chapters', 'workId', id);
    for (const ch of chapters) {
      await Models.deleteChapter(ch.id);
    }
    await DB.deleteByIndex('characters', 'workId', id);
    await DB.deleteByIndex('settingNotes', 'workId', id);
    await DB.deleteByIndex('memos', 'workId', id);
    await DB.deleteByIndex('schedules', 'workId', id);
    await DB.deleteByIndex('writingLog', 'workId', id);
    await DB.deleteByIndex('relationshipTags', 'workId', id);
    await DB.deleteByIndex('characterGroups', 'workId', id);
    await DB.deleteByIndex('memoGroups', 'workId', id);
    await DB.deleteByIndex('memoConnections', 'workId', id);
    await DB.deleteByIndex('submissions', 'workId', id);
    await DB.delete('works', id);
  },

  async createChapter(workId, { title } = {}) {
    const existing = await DB.getAllByIndex('chapters', 'workId', workId);
    const now = new Date().toISOString();
    const chapter = {
      id: DB.uuid(),
      workId,
      title: title || `챕터 ${existing.length + 1}`,
      order: existing.length,
      targetChars: 0,
      dueDate: null,
      serializedAt: null, // 웹소설 형식 작품에서만 쓰는 연재일(ISO date) — 단행본 작품은 null로 유지
      createdAt: now,
      updatedAt: now,
    };
    await DB.add('chapters', chapter);
    return chapter;
  },

  async updateChapter(id, patch) {
    const chapter = await DB.get('chapters', id);
    if (!chapter) return null;
    Object.assign(chapter, patch, { updatedAt: new Date().toISOString() });
    await DB.put('chapters', chapter);
    return chapter;
  },

  async deleteChapter(id) {
    const scenes = await DB.getAllByIndex('scenes', 'chapterId', id);
    for (const sc of scenes) {
      await DB.deleteByIndex('sceneVersions', 'sceneId', sc.id);
      await DB.delete('scenes', sc.id);
    }
    await DB.delete('chapters', id);
  },

  async reorderChapters(workId, orderedIds) {
    for (let i = 0; i < orderedIds.length; i++) {
      const ch = await DB.get('chapters', orderedIds[i]);
      if (ch) {
        ch.order = i;
        await DB.put('chapters', ch);
      }
    }
  },

  async createScene(chapterId, workId, { title } = {}) {
    const existing = await DB.getAllByIndex('scenes', 'chapterId', chapterId);
    const now = new Date().toISOString();
    const scene = {
      id: DB.uuid(),
      chapterId,
      workId,
      title: title || `장면 ${existing.length + 1}`,
      content: '',
      summary: '',
      status: 'draft', // draft | revising | done
      order: existing.length,
      wordCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    await DB.add('scenes', scene);
    return scene;
  },

  async updateScene(id, patch) {
    const scene = await DB.get('scenes', id);
    if (!scene) return null;
    const prevCount = scene.wordCount || 0;
    Object.assign(scene, patch, { updatedAt: new Date().toISOString() });
    if (typeof patch.content === 'string') {
      scene.wordCount = Utils.countWords(patch.content);
      const delta = scene.wordCount - prevCount;
      if (delta > 0) await Models.logWritingDelta(scene.workId, delta);
    }
    await DB.put('scenes', scene);
    return scene;
  },

  async deleteScene(id) {
    await DB.deleteByIndex('sceneVersions', 'sceneId', id);
    await DB.delete('scenes', id);
  },

  async reorderScenes(chapterId, orderedIds) {
    for (let i = 0; i < orderedIds.length; i++) {
      const sc = await DB.get('scenes', orderedIds[i]);
      if (sc) {
        sc.order = i;
        await DB.put('scenes', sc);
      }
    }
  },

  async moveScene(sceneId, targetChapterId) {
    const scene = await DB.get('scenes', sceneId);
    if (!scene) return null;
    const existing = await DB.getAllByIndex('scenes', 'chapterId', targetChapterId);
    scene.chapterId = targetChapterId;
    scene.order = existing.length;
    scene.updatedAt = new Date().toISOString();
    await DB.put('scenes', scene);
    return scene;
  },

  // ---- Scene versions ----
  async saveSceneVersion(sceneId, content, label = '자동 저장') {
    const version = {
      id: DB.uuid(),
      sceneId,
      content,
      label,
      wordCount: Utils.countWords(content),
      createdAt: new Date().toISOString(),
    };
    await DB.add('sceneVersions', version);
    return version;
  },

  async getSceneVersions(sceneId) {
    const versions = await DB.getAllByIndex('sceneVersions', 'sceneId', sceneId);
    return versions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  },

  async restoreSceneVersion(sceneId, versionId) {
    const version = await DB.get('sceneVersions', versionId);
    if (!version) return null;
    const scene = await DB.get('scenes', sceneId);
    if (!scene) return null;
    // snapshot current before restoring, so restore itself is reversible
    await Models.saveSceneVersion(sceneId, scene.content, '복원 전 자동 백업');
    scene.content = version.content;
    scene.wordCount = Utils.countWords(version.content);
    scene.updatedAt = new Date().toISOString();
    await DB.put('scenes', scene);
    return scene;
  },

  async pruneOldAutoVersions(sceneId, keep = 30) {
    const versions = await Models.getSceneVersions(sceneId);
    const auto = versions.filter((v) => v.label === '자동 저장');
    if (auto.length > keep) {
      const toDelete = auto.slice(keep);
      for (const v of toDelete) await DB.delete('sceneVersions', v.id);
    }
  },

  // ---- Characters ----
  async createCharacter(workId, { name } = {}) {
    const now = new Date().toISOString();
    const character = {
      id: DB.uuid(),
      workId,
      name: name || '새 캐릭터',
      role: '',
      appearance: '',
      personality: '',
      background: '',
      notes: '',
      tags: [],
      relationships: [], // [{ targetId, tagIds, label, note }]
      relX: null,
      relY: null,
      createdAt: now,
      updatedAt: now,
    };
    await DB.add('characters', character);
    return character;
  },

  async updateCharacter(id, patch) {
    const c = await DB.get('characters', id);
    if (!c) return null;
    Object.assign(c, patch, { updatedAt: new Date().toISOString() });
    await DB.put('characters', c);
    return c;
  },

  async deleteCharacter(id) {
    const all = await DB.getAllByIndex('characters', 'workId', (await DB.get('characters', id))?.workId);
    for (const c of all) {
      if (c.relationships && c.relationships.some((r) => r.targetId === id)) {
        c.relationships = c.relationships.filter((r) => r.targetId !== id);
        await DB.put('characters', c);
      }
    }
    await DB.delete('characters', id);
  },

  DEFAULT_RELATIONSHIP_TAGS: [
    { label: '가족', color: '#f2994a' },
    { label: '연인', color: '#ff6b9a' },
    { label: '친구', color: '#4fd1c5' },
    { label: '동료', color: '#5aa9ff' },
    { label: '라이벌', color: '#f2c94c' },
    { label: '적', color: '#ff5c7a' },
    { label: '기타', color: '#9297a8' },
  ],

  // Reads the tag ids for a relationship, absorbing the legacy single `type` field
  // (from before relationships supported multiple hashtags) at read time.
  relationshipTagIds(rel) {
    if (rel.tagIds) return rel.tagIds;
    return rel.type ? [rel.type] : [];
  },

  async getRelationshipTags(workId) {
    const tags = await DB.getAllByIndex('relationshipTags', 'workId', workId);
    return tags.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  },

  async createRelationshipTag(workId, { label = '새 태그', color = '#9297a8' } = {}) {
    const tag = { id: DB.uuid(), workId, label, color, createdAt: new Date().toISOString() };
    await DB.add('relationshipTags', tag);
    return tag;
  },

  async updateRelationshipTag(id, patch) {
    const tag = await DB.get('relationshipTags', id);
    if (!tag) return null;
    Object.assign(tag, patch);
    await DB.put('relationshipTags', tag);
    return tag;
  },

  async deleteRelationshipTag(id) {
    const tag = await DB.get('relationshipTags', id);
    if (!tag) return null;
    const chars = await DB.getAllByIndex('characters', 'workId', tag.workId);
    for (const c of chars) {
      if (!c.relationships || !c.relationships.length) continue;
      let changed = false;
      c.relationships.forEach((r) => {
        const ids = Models.relationshipTagIds(r);
        if (ids.includes(id)) {
          r.tagIds = ids.filter((x) => x !== id);
          delete r.type;
          changed = true;
        }
      });
      if (changed) await DB.put('characters', c);
    }
    await DB.delete('relationshipTags', id);
  },

  // ---- Character groups (simple tag-style bundling of multiple characters) ----
  async getCharacterGroups(workId) {
    const groups = await DB.getAllByIndex('characterGroups', 'workId', workId);
    return groups.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  },

  async createCharacterGroup(workId, { name = '새 그룹', color = '#8b7bff', memberIds = [] } = {}) {
    const now = new Date().toISOString();
    const group = { id: DB.uuid(), workId, name, color, memberIds, createdAt: now, updatedAt: now };
    await DB.add('characterGroups', group);
    return group;
  },

  async updateCharacterGroup(id, patch) {
    const g = await DB.get('characterGroups', id);
    if (!g) return null;
    Object.assign(g, patch, { updatedAt: new Date().toISOString() });
    await DB.put('characterGroups', g);
    return g;
  },

  async deleteCharacterGroup(id) {
    await DB.delete('characterGroups', id);
  },

  async addRelationship(characterId, { targetId, tagIds = [], label = '', note = '' }) {
    const c = await DB.get('characters', characterId);
    if (!c) return null;
    c.relationships = c.relationships || [];
    c.relationships.push({ targetId, tagIds, label, note });
    c.updatedAt = new Date().toISOString();
    await DB.put('characters', c);
    return c;
  },

  async updateRelationship(characterId, index, patch) {
    const c = await DB.get('characters', characterId);
    if (!c || !c.relationships || !c.relationships[index]) return null;
    Object.assign(c.relationships[index], patch);
    c.updatedAt = new Date().toISOString();
    await DB.put('characters', c);
    return c;
  },

  async removeRelationship(characterId, index) {
    const c = await DB.get('characters', characterId);
    if (!c || !c.relationships) return null;
    c.relationships.splice(index, 1);
    c.updatedAt = new Date().toISOString();
    await DB.put('characters', c);
    return c;
  },

  // Assembles the character-relationship graph (nodes + colored/labeled edges +
  // per-character group color) for a work. Shared by the full interactive
  // relationship map (js/views/characters.js) and the static mini-preview on the
  // home screen's work cards (js/views/home.js) — same shape, different renderer.
  async getRelationshipGraphData(workId) {
    const [characters, groups, tags] = await Promise.all([
      DB.getAllByIndex('characters', 'workId', workId),
      Models.getCharacterGroups(workId),
      Models.getRelationshipTags(workId),
    ]);
    const tagById = Object.fromEntries(tags.map((t) => [t.id, t]));
    const edges = [];
    characters.forEach((c) => {
      (c.relationships || []).forEach((r, idx) => {
        const relTags = Models.relationshipTagIds(r).map((id) => tagById[id]).filter(Boolean);
        const color = relTags[0] ? relTags[0].color : '#9297a8';
        const label = r.label || relTags.map((t) => t.label).join(' · ');
        edges.push({ source: c.id, target: r.targetId, label, color, ownerId: c.id, index: idx });
      });
    });
    const groupColorByChar = {};
    groups.forEach((g) => (g.memberIds || []).forEach((cid) => {
      if (!groupColorByChar[cid]) groupColorByChar[cid] = g.color;
    }));
    return { characters, edges, groupColorByChar, tags, tagById };
  },

  // ---- Setting notes ----
  async createSettingNote(workId, { title, category = '일반' } = {}) {
    const now = new Date().toISOString();
    const note = {
      id: DB.uuid(),
      workId,
      title: title || '새 설정',
      category,
      content: '',
      tags: [],
      createdAt: now,
      updatedAt: now,
    };
    await DB.add('settingNotes', note);
    return note;
  },

  async updateSettingNote(id, patch) {
    const n = await DB.get('settingNotes', id);
    if (!n) return null;
    Object.assign(n, patch, { updatedAt: new Date().toISOString() });
    await DB.put('settingNotes', n);
    return n;
  },

  async deleteSettingNote(id) {
    await DB.delete('settingNotes', id);
  },

  // ---- Memos ----
  async createMemo(workId, { content = '', x = null, y = null, w = 220, h = 140, color = null, groupId = null, opacity = 0 } = {}) {
    const now = new Date().toISOString();
    const memo = {
      id: DB.uuid(),
      workId: workId || null,
      content,
      archived: false,
      x, y, w, h, color, groupId,
      opacity, // 0 = no fill (border stripe only, today's look) .. 1 = fully filled with `color`
      createdAt: now,
      updatedAt: now,
    };
    await DB.add('memos', memo);
    return memo;
  },

  async updateMemo(id, patch) {
    const m = await DB.get('memos', id);
    if (!m) return null;
    Object.assign(m, patch, { updatedAt: new Date().toISOString() });
    await DB.put('memos', m);
    return m;
  },

  async deleteMemo(id) {
    const memo = await DB.get('memos', id);
    if (memo && memo.workId) {
      const conns = await DB.getAllByIndex('memoConnections', 'workId', memo.workId);
      for (const c of conns) {
        if (c.fromMemoId === id || c.toMemoId === id) await DB.delete('memoConnections', c.id);
      }
    }
    await DB.delete('memos', id);
  },

  // ---- Memo canvas groups & connections (freeform memo board) ----
  async getMemoGroups(workId) {
    const groups = await DB.getAllByIndex('memoGroups', 'workId', workId);
    return groups.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  },

  async createMemoGroup(workId, { name = '새 그룹', color = '#8b7bff', fillColor = null, x = 40, y = 40, w = 420, h = 300 } = {}) {
    const now = new Date().toISOString();
    // `color` is the border color (kept as-is for backward compat with existing
    // groups); `fillColor` is optional — null means "derive a soft tint of the
    // border color", same as the look before this field existed.
    const group = { id: DB.uuid(), workId, name, color, fillColor, x, y, w, h, createdAt: now, updatedAt: now };
    await DB.add('memoGroups', group);
    return group;
  },

  async updateMemoGroup(id, patch) {
    const g = await DB.get('memoGroups', id);
    if (!g) return null;
    Object.assign(g, patch, { updatedAt: new Date().toISOString() });
    await DB.put('memoGroups', g);
    return g;
  },

  async deleteMemoGroup(id) {
    const group = await DB.get('memoGroups', id);
    if (group) {
      const memos = await DB.getAllByIndex('memos', 'workId', group.workId);
      for (const m of memos) {
        if (m.groupId === id) await DB.put('memos', { ...m, groupId: null });
      }
    }
    await DB.delete('memoGroups', id);
  },

  async getMemoConnections(workId) {
    return DB.getAllByIndex('memoConnections', 'workId', workId);
  },

  async createMemoConnection(workId, { fromMemoId, toMemoId, label = '', style = 'solid', arrowStart = false, arrowEnd = false } = {}) {
    const conn = { id: DB.uuid(), workId, fromMemoId, toMemoId, label, style, arrowStart, arrowEnd, createdAt: new Date().toISOString() };
    await DB.add('memoConnections', conn);
    return conn;
  },

  async updateMemoConnection(id, patch) {
    const c = await DB.get('memoConnections', id);
    if (!c) return null;
    Object.assign(c, patch);
    await DB.put('memoConnections', c);
    return c;
  },

  async deleteMemoConnection(id) {
    await DB.delete('memoConnections', id);
  },

  // ---- Schedules (deadlines / goal events) ----
  async createSchedule(workId, { title, date, endDate = null, allDay = true, startTime = null, endTime = null, type = 'deadline', linkedChapterId = null, targetChars = 0 } = {}) {
    const now = new Date().toISOString();
    const schedule = {
      id: DB.uuid(),
      workId,
      title: title || '새 일정',
      date: date || Utils.todayStr(),
      endDate, // optional — end of a multi-day range, inclusive
      allDay,
      startTime: allDay ? null : startTime, // 'HH:MM' or null
      endTime: allDay ? null : endTime,
      type, // 'deadline' | 'event'
      linkedChapterId,
      targetChars,
      completed: false,
      createdAt: now,
      updatedAt: now,
    };
    await DB.add('schedules', schedule);
    return schedule;
  },

  async updateSchedule(id, patch) {
    const s = await DB.get('schedules', id);
    if (!s) return null;
    Object.assign(s, patch, { updatedAt: new Date().toISOString() });
    await DB.put('schedules', s);
    return s;
  },

  async deleteSchedule(id) {
    await DB.delete('schedules', id);
  },

  async getSchedulesForWork(workId) {
    const schedules = await DB.getAllByIndex('schedules', 'workId', workId);
    return schedules.sort((a, b) => a.date.localeCompare(b.date));
  },

  // ---- Missions (도전과제형 목표: 스트릭/기간 누적/수동 체크) ----
  MISSION_KIND_LABELS: { streak: '연속 달성', total: '기간 누적', custom: '체크리스트' },

  async getMissionsForWork(workId) {
    const missions = await DB.getAllByIndex('missions', 'workId', workId);
    return missions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  },

  async createMission(workId, { title, kind = 'custom', targetValue = 0, targetDays = 0, startDate = null, endDate = null } = {}) {
    const now = new Date().toISOString();
    const mission = {
      id: DB.uuid(),
      workId,
      title: title || '새 미션',
      kind, // 'streak' (매일 targetValue자 이상, targetDays일 연속) | 'total' (기간 내 targetValue자 누적) | 'custom' (수동 체크)
      targetValue,
      targetDays, // only meaningful for 'streak' — the day-count goal (targetValue is the daily char threshold)
      startDate: startDate || Utils.todayStr(),
      endDate,
      completed: false,
      createdAt: now,
      updatedAt: now,
    };
    await DB.add('missions', mission);
    return mission;
  },

  async updateMission(id, patch) {
    const m = await DB.get('missions', id);
    if (!m) return null;
    Object.assign(m, patch, { updatedAt: new Date().toISOString() });
    await DB.put('missions', m);
    return m;
  },

  async deleteMission(id) {
    await DB.delete('missions', id);
  },

  // Returns { progress: 0~1|null, current, target, done } — 'custom' missions have
  // no auto-trackable metric, so progress is null and `done` just mirrors the
  // manually-set `completed` flag.
  async getMissionProgress(mission) {
    if (mission.kind === 'custom') {
      return { progress: null, current: null, target: null, done: !!mission.completed };
    }
    const logs = await Models.getWritingLogForWork(mission.workId);
    const byDate = Object.fromEntries(logs.map((l) => [l.date, l.chars]));
    const end = mission.endDate || Utils.todayStr();

    if (mission.kind === 'streak') {
      let streak = 0;
      const cursor = new Date(Math.min(new Date(end), new Date()));
      for (;;) {
        const key = Utils.dateStr(cursor);
        if (key < mission.startDate) break;
        if ((byDate[key] || 0) >= mission.targetValue) {
          streak++;
          cursor.setDate(cursor.getDate() - 1);
        } else break;
      }
      return {
        progress: mission.targetDays ? Math.min(1, streak / mission.targetDays) : null,
        current: streak,
        target: mission.targetDays || null,
        done: mission.completed || (mission.targetDays > 0 && streak >= mission.targetDays),
      };
    }

    // 'total': sum writingLog chars within [startDate, end]
    const total = Object.entries(byDate)
      .filter(([date]) => date >= mission.startDate && date <= end)
      .reduce((sum, [, chars]) => sum + chars, 0);
    return { progress: mission.targetValue ? Math.min(1, total / mission.targetValue) : null, current: total, target: mission.targetValue, done: mission.completed || total >= mission.targetValue };
  },

  // ---- Submissions (투고 내역: 원고를 출판사/플랫폼에 투고한 기록) ----
  SUBMISSION_STATUSES: ['검토중', '합격', '불합격', '보류'],

  async getSubmissions(workId) {
    const subs = await DB.getAllByIndex('submissions', 'workId', workId);
    return subs.sort((a, b) => b.date.localeCompare(a.date));
  },

  async createSubmission(workId, { publisher, date, status = '검토중', note = '' } = {}) {
    const now = new Date().toISOString();
    const submission = {
      id: DB.uuid(),
      workId,
      publisher: publisher || '이름 없는 투고처',
      date: date || Utils.todayStr(),
      status,
      note,
      createdAt: now,
      updatedAt: now,
    };
    await DB.add('submissions', submission);
    return submission;
  },

  async updateSubmission(id, patch) {
    const s = await DB.get('submissions', id);
    if (!s) return null;
    Object.assign(s, patch, { updatedAt: new Date().toISOString() });
    await DB.put('submissions', s);
    return s;
  },

  async deleteSubmission(id) {
    await DB.delete('submissions', id);
  },

  // ---- Writing log (for streak / daily-weekly goal tracking) ----
  async logWritingDelta(workId, delta) {
    if (!workId || !delta) return;
    const date = Utils.todayStr();
    const logs = await DB.getAllByIndex('writingLog', 'workId', workId);
    let entry = logs.find((l) => l.date === date);
    if (entry) {
      entry.chars += delta;
      await DB.put('writingLog', entry);
    } else {
      await DB.add('writingLog', {
        id: DB.uuid(),
        workId,
        date,
        chars: delta,
      });
    }
  },

  async getWritingLogForWork(workId) {
    const logs = await DB.getAllByIndex('writingLog', 'workId', workId);
    return logs.sort((a, b) => a.date.localeCompare(b.date));
  },

  async getWritingStreak(workId, dailyGoalChars) {
    if (!dailyGoalChars) return 0;
    const logs = await Models.getWritingLogForWork(workId);
    const byDate = Object.fromEntries(logs.map((l) => [l.date, l.chars]));
    let streak = 0;
    let cursor = new Date();
    // if today's goal isn't met yet, start counting from yesterday so an in-progress day doesn't break the streak
    if (!byDate[Utils.todayStr()] || byDate[Utils.todayStr()] < dailyGoalChars) {
      cursor.setDate(cursor.getDate() - 1);
    }
    for (;;) {
      const key = Utils.dateStr(cursor);
      if ((byDate[key] || 0) >= dailyGoalChars) {
        streak++;
        cursor.setDate(cursor.getDate() - 1);
      } else break;
    }
    return streak;
  },

  async getWeeklyProgress(workId) {
    const logs = await Models.getWritingLogForWork(workId);
    const now = new Date();
    const day = (now.getDay() + 6) % 7; // Monday = 0
    const monday = new Date(now);
    monday.setDate(now.getDate() - day);
    const mondayKey = Utils.dateStr(monday);
    return logs.filter((l) => l.date >= mondayKey).reduce((sum, l) => sum + l.chars, 0);
  },

  // ---- Aggregate loaders ----
  async getWorkBundle(workId) {
    const [work, chapters, characters, settingNotes, memos] = await Promise.all([
      DB.get('works', workId),
      DB.getAllByIndex('chapters', 'workId', workId),
      DB.getAllByIndex('characters', 'workId', workId),
      DB.getAllByIndex('settingNotes', 'workId', workId),
      DB.getAllByIndex('memos', 'workId', workId),
    ]);
    chapters.sort((a, b) => a.order - b.order);
    const scenesByChapter = {};
    for (const ch of chapters) {
      const scenes = await DB.getAllByIndex('scenes', 'chapterId', ch.id);
      scenes.sort((a, b) => a.order - b.order);
      scenesByChapter[ch.id] = scenes;
    }
    return { work, chapters, scenesByChapter, characters, settingNotes, memos };
  },

  async getWorkStats(workId) {
    const bundle = await Models.getWorkBundle(workId);
    let sceneCount = 0;
    let wordCount = 0;
    Object.values(bundle.scenesByChapter).forEach((scenes) => {
      sceneCount += scenes.length;
      scenes.forEach((s) => (wordCount += s.wordCount || 0));
    });
    return {
      chapterCount: bundle.chapters.length,
      sceneCount,
      wordCount,
      characterCount: bundle.characters.length,
      settingCount: bundle.settingNotes.length,
      memoCount: bundle.memos.length,
    };
  },

  async getRecentActivity(workId, limit = 12) {
    const bundle = await Models.getWorkBundle(workId);
    const allScenes = Object.values(bundle.scenesByChapter).flat();
    const items = [
      ...allScenes.map((s) => ({ type: 'scene', id: s.id, title: s.title, updatedAt: s.updatedAt })),
      ...bundle.characters.map((c) => ({ type: 'character', id: c.id, title: c.name, updatedAt: c.updatedAt })),
      ...bundle.settingNotes.map((n) => ({ type: 'setting', id: n.id, title: n.title, updatedAt: n.updatedAt })),
      ...bundle.memos.map((m) => ({ type: 'memo', id: m.id, title: Utils.truncate(m.content, 30) || '메모', updatedAt: m.updatedAt })),
    ].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    return items.slice(0, limit);
  },

  async getGoalSummary(workId) {
    const bundle = await Models.getWorkBundle(workId);
    const work = bundle.work;
    let totalChars = 0;
    const chapterInfo = bundle.chapters.map((ch) => {
      const scenes = bundle.scenesByChapter[ch.id] || [];
      const chars = scenes.reduce((sum, s) => sum + (s.wordCount || 0), 0);
      totalChars += chars;
      return { ...ch, chars, progress: ch.targetChars ? Math.min(1, chars / ch.targetChars) : null };
    });

    const [todayLogs, weekChars, streak, schedules] = await Promise.all([
      Models.getWritingLogForWork(workId),
      Models.getWeeklyProgress(workId),
      Models.getWritingStreak(workId, work.dailyGoalChars),
      Models.getSchedulesForWork(workId),
    ]);
    const todayEntry = todayLogs.find((l) => l.date === Utils.todayStr());
    const todayChars = todayEntry ? todayEntry.chars : 0;

    const upcoming = [
      ...schedules.map((s) => ({
        id: s.id,
        kind: 'schedule',
        title: s.title,
        date: s.date,
        endDate: s.endDate || null,
        allDay: s.allDay !== false,
        startTime: s.startTime || null,
        endTime: s.endTime || null,
        type: s.type,
        completed: s.completed,
        targetChars: s.targetChars,
      })),
      ...chapterInfo
        .filter((c) => c.dueDate)
        .map((c) => ({
          id: c.id,
          kind: 'chapter',
          title: `📂 ${c.title} 마감`,
          date: c.dueDate,
          type: 'deadline',
          completed: c.progress !== null && c.progress >= 1,
          targetChars: c.targetChars,
        })),
      ...(work.targetDate
        ? [{ id: work.id, kind: 'work', title: `🏁 ${work.title} 완결 목표`, date: work.targetDate, type: 'deadline', completed: false, targetChars: work.targetTotalChars }]
        : []),
    ].sort((a, b) => a.date.localeCompare(b.date));

    return {
      work,
      totalChars,
      totalProgress: work.targetTotalChars ? Math.min(1, totalChars / work.targetTotalChars) : null,
      todayChars,
      todayProgress: work.dailyGoalChars ? Math.min(1, todayChars / work.dailyGoalChars) : null,
      weekChars,
      weekProgress: work.weeklyGoalChars ? Math.min(1, weekChars / work.weeklyGoalChars) : null,
      streak,
      chapterInfo,
      schedules,
      upcoming,
    };
  },

  // ---- Research posts (자료 수집: 리치텍스트 게시글 + 첨부파일, 목록/보드 이중 뷰) ----
  async getResearchPostsForWork(workId) {
    const posts = await DB.getAllByIndex('researchPosts', 'workId', workId);
    return posts.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  },

  async createResearchPost(workId, { title = '', content = '', attachments = [], boardX = null, boardY = null } = {}) {
    const now = new Date().toISOString();
    const post = {
      id: DB.uuid(),
      workId,
      title: title || '제목 없는 자료',
      content,
      attachments,
      boardX,
      boardY,
      createdAt: now,
      updatedAt: now,
    };
    await DB.add('researchPosts', post);
    return post;
  },

  async updateResearchPost(id, patch) {
    const p = await DB.get('researchPosts', id);
    if (!p) return null;
    Object.assign(p, patch, { updatedAt: new Date().toISOString() });
    await DB.put('researchPosts', p);
    return p;
  },

  async deleteResearchPost(id) {
    await DB.delete('researchPosts', id);
  },

  // ---- One-time legacy data migrations ----
  // Add new entries here as the schema evolves; each migration is guarded so it only
  // ever runs once per browser profile (tracked in localStorage) regardless of how
  // many times the app boots. Call Models.migrateLegacyData() once at startup.
  MIGRATIONS: [
    {
      // Relationships used to carry a single `type` string (e.g. 'family'); they now
      // carry `tagIds`, an array into the per-work relationshipTags store. Absorb any
      // remaining legacy relationships by finding-or-creating a same-labeled tag.
      id: 'relationship-type-to-tagids-v4',
      async run() {
        const LEGACY_TYPE_LABELS = { family: '가족', lover: '연인', friend: '친구', ally: '동료', rival: '라이벌', enemy: '적', other: '기타' };
        const works = await DB.getAll('works');
        for (const work of works) {
          const chars = await DB.getAllByIndex('characters', 'workId', work.id);
          const needsWork = chars.some((c) => (c.relationships || []).some((r) => !r.tagIds && r.type));
          if (!needsWork) continue;

          const tagByLabel = Object.fromEntries((await Models.getRelationshipTags(work.id)).map((t) => [t.label, t]));
          async function findOrCreateTag(label) {
            if (tagByLabel[label]) return tagByLabel[label];
            const seed = Models.DEFAULT_RELATIONSHIP_TAGS.find((d) => d.label === label);
            const tag = await Models.createRelationshipTag(work.id, { label, color: seed ? seed.color : '#9297a8' });
            tagByLabel[label] = tag;
            return tag;
          }

          for (const c of chars) {
            let changed = false;
            for (const r of c.relationships || []) {
              if (!r.tagIds && r.type) {
                const label = LEGACY_TYPE_LABELS[r.type] || r.type;
                const tag = await findOrCreateTag(label);
                r.tagIds = [tag.id];
                delete r.type;
                changed = true;
              }
            }
            if (changed) await DB.put('characters', c);
          }
        }
      },
    },
  ],

  async migrateLegacyData() {
    const KEY = 'sw-migrations-done';
    let done = [];
    try {
      done = JSON.parse(localStorage.getItem(KEY) || '[]');
    } catch (e) {
      done = [];
    }
    for (const migration of Models.MIGRATIONS) {
      if (done.includes(migration.id)) continue;
      await migration.run();
      done.push(migration.id);
      localStorage.setItem(KEY, JSON.stringify(done));
    }
  },
};
