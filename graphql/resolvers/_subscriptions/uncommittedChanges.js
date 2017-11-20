const { lib: { RedisPubSub: { pubsub, filtered } } } = require('backend-modules-base')
const { Roles: { ensureUserHasRole } } = require('backend-modules-auth')

// filtering with asyncIterator -> filtered by redis
// filtering with payload, variables -> filtered by node
// TODO
// test filtering with asyncIterator
// why is variables undefined?
module.exports = {
  subscribe: (_, args, { user }) => {
    ensureUserHasRole(user, 'editor')
    return filtered(
      pubsub.asyncIterator('uncommittedChanges'),
      ({ uncommittedChanges: { repoId } }, variables) => (
        repoId === args.repoId
      )
    )()
  }
}
