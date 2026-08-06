const Search = {
  async searchAll(query, { workId = null } = {}) {
    const q = (query || '').trim().toLowerCase();
    if (!q) return [];
    const results = [];

    const works = await DB.getAll('works');
    const relevantWorkIds = workId ? [workId] : works.map((w) => w.id);
    const workById = Object.fromEntries(works.map((w) => [w.id, w]));

    if (!workId) {
      works.forEach((w) => {
        const tagsMatch = (w.tags || []).some((t) => t.toLowerCase().includes(q));
        if (w.title.toLowerCase().includes(q) || (w.description || '').toLowerCase().includes(q) || tagsMatch) {
          results.push({
            type: 'work',
            id: w.id,
            workId: w.id,
            title: w.title,
            snippet: w.description || '',
            route: `#/work/${w.id}/dashboard`,
          });
        }
      });
    }

    for (const wid of relevantWorkIds) {
      const [chapters, characters, settingNotes, memos] = await Promise.all([
        DB.getAllByIndex('chapters', 'workId', wid),
        DB.getAllByIndex('characters', 'workId', wid),
        DB.getAllByIndex('settingNotes', 'workId', wid),
        DB.getAllByIndex('memos', 'workId', wid),
      ]);

      for (const ch of chapters) {
        if (ch.title.toLowerCase().includes(q)) {
          results.push({
            type: 'chapter',
            id: ch.id,
            workId: wid,
            title: ch.title,
            snippet: workById[wid] ? workById[wid].title : '',
            route: `#/work/${wid}/manuscript?chapter=${ch.id}`,
          });
        }
        const scenes = await DB.getAllByIndex('scenes', 'chapterId', ch.id);
        for (const sc of scenes) {
          const plain = Utils.stripHtml(sc.content);
          const titleMatch = sc.title.toLowerCase().includes(q);
          const contentIdx = plain.toLowerCase().indexOf(q);
          if (titleMatch || contentIdx >= 0) {
            results.push({
              type: 'scene',
              id: sc.id,
              workId: wid,
              title: sc.title,
              snippet: Search.makeSnippet(plain, contentIdx, q),
              route: `#/work/${wid}/manuscript/${sc.id}`,
            });
          }
        }
      }

      for (const c of characters) {
        const hay = [c.name, c.role, c.appearance, c.personality, c.background, c.notes].join(' ').toLowerCase();
        if (hay.includes(q)) {
          results.push({
            type: 'character',
            id: c.id,
            workId: wid,
            title: c.name,
            snippet: Utils.truncate(c.role || c.personality || '', 80),
            route: `#/work/${wid}/characters?id=${c.id}`,
          });
        }
      }

      for (const n of settingNotes) {
        const hay = [n.title, n.category, n.content].join(' ').toLowerCase();
        if (hay.includes(q)) {
          results.push({
            type: 'setting',
            id: n.id,
            workId: wid,
            title: n.title,
            snippet: Utils.truncate(Utils.stripHtml(n.content), 80),
            route: `#/work/${wid}/settings?id=${n.id}`,
          });
        }
      }

      for (const m of memos) {
        if ((m.content || '').toLowerCase().includes(q)) {
          results.push({
            type: 'memo',
            id: m.id,
            workId: wid,
            title: Utils.truncate(m.content, 40) || '(빈 메모)',
            snippet: workById[wid] ? workById[wid].title : '전체 메모',
            route: `#/work/${wid}/inbox?id=${m.id}`,
          });
        }
      }
    }

    return results;
  },

  makeSnippet(plain, idx, q, radius = 40) {
    if (idx < 0) return Utils.truncate(plain, 80);
    const start = Math.max(0, idx - radius);
    const end = Math.min(plain.length, idx + q.length + radius);
    let snippet = plain.slice(start, end);
    if (start > 0) snippet = '…' + snippet;
    if (end < plain.length) snippet += '…';
    return snippet;
  },
};
