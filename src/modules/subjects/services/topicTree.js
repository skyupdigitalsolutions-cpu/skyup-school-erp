'use strict';

/**
 * Pure helper: nests a flat list of SyllabusTopic documents (each with
 * `_id`/`parent`/`sequence`) into a parent -> children tree. Root topics are
 * those whose `parent` is null/undefined, or whose parent isn't present in
 * the given list (defensive — keeps a topic visible even if its parent was
 * filtered out or archived).
 *
 * @param {Array<object>} topics  flat list, plain objects (e.g. from .lean())
 * @returns {Array<object>} topics with a `children` array, root-level only
 */
function buildTopicTree(topics) {
  const byId = new Map();
  topics.forEach((t) => byId.set(String(t._id), { ...t, children: [] }));

  const roots = [];
  byId.forEach((node) => {
    const parentId = node.parent ? String(node.parent) : null;
    if (parentId && byId.has(parentId)) {
      byId.get(parentId).children.push(node);
    } else {
      roots.push(node);
    }
  });

  const bySequence = (a, b) => (a.sequence || 0) - (b.sequence || 0);
  byId.forEach((node) => node.children.sort(bySequence));
  roots.sort(bySequence);

  return roots;
}

module.exports = { buildTopicTree };
