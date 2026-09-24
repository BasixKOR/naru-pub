// Every replacement and deletion quotes the version the editor opened.
export function publishPost(owner, id, data, postRevision, draftRevision) {
  return owner.batch([
    {
      collection: "posts",
      set: {
        id,
        data,
        condition: postRevision ? { revision: postRevision } : { absent: true },
      },
    },
    ...(draftRevision
      ? [
          {
            collection: "drafts",
            delete: { id, condition: { revision: draftRevision } },
          },
        ]
      : []),
  ]);
}
