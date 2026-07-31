// Entity factories + higher level operations built on top of DB
const Models = {
  async createWork({ title, description = '', color = '#6c5ce7', length = 'long' }) {
    const now = new Date().toISOString();
    const work = {
      id: DB.uuid(),
      title: title || '제목 없는 작품',
      description,
      color,
      length, // 'long' (장편) | 'short' (단편)
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
  async createMemo(workId, { content = '' } = {}) {
    const now = new Date().toISOString();
    const memo = {
      id: DB.uuid(),
      workId: workId || null,
      content,
      archived: false,
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
    await DB.delete('memos', id);
  },

  // ---- Schedules (deadlines / goal events) ----
  async createSchedule(workId, { title, date, type = 'deadline', linkedChapterId = null, targetChars = 0 } = {}) {
    const now = new Date().toISOString();
    const schedule = {
      id: DB.uuid(),
      workId,
      title: title || '새 일정',
      date: date || Utils.todayStr(),
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
};
