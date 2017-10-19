const Roles = require('../../../../lib/Roles')

module.exports = async (_, args, {pgdb, user, req, t}) => {
  Roles.ensureUserHasRole(user, 'member')

  const {
    id,
    content
  } = args

  const transaction = await pgdb.transactionBegin()
  try {
    // ensure comment exists and belongs to user
    const comment = await transaction.public.comments.findOne({ id })
    if (!comment) {
      throw new Error(t('api/comment/404'))
    }
    if (comment.userId !== user.id) {
      throw new Error(t('api/comment/notYours'))
    }

    const discussion = await transaction.public.discussions.findOne({
      id: comment.discussionId
    })

    // ensure comment length is within limit
    if (discussion.maxLength && content.length > discussion.maxLength) {
      throw new Error(t('api/comment/tooLong', { maxLength: discussion.maxLength }))
    }

    const newComment = await transaction.public.comments.updateAndGetOne({
      id: comment.id
    }, {
      content,
      updatedAt: new Date()
    })

    await transaction.transactionCommit()

    return newComment
  } catch (e) {
    await transaction.transactionRollback()
    throw e
  }
}