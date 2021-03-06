const debug = require('debug')('access:lib:grants')
const moment = require('moment')
const validator = require('validator')

const { Roles } = require('@orbiting/backend-modules-auth')

const campaignsLib = require('./campaigns')
const constraints = require('./constraints')
const eventsLib = require('./events')
const mailLib = require('./mail')
const membershipsLib = require('./memberships')

const evaluateConstraints = async (grantee, campaign, email, t, pgdb) => {
  const errors = []

  for (const constraint of campaign.constraints) {
    const name = Object.keys(constraint).shift()
    const settings = constraint[name]

    if (!constraints[name]) {
      throw new Error(`Unable to evalute contraint "${name}"`)
    }

    const valid = await constraints[name].isGrantable(
      { settings, grantee, email, campaign },
      { pgdb }
    )

    debug('evaluateConstraints', {
      name: campaign.name,
      constraint: name,
      settings,
      valid
    })

    if (!valid) {
      errors.push(t(
        `api/access/constraint/${name}/error`,
        { ...settings, email }
      ))
    }
  }

  debug({ errors })

  return { errors }
}

const grant = async (grantee, campaignId, email, t, pgdb, mail) => {
  if (!validator.isEmail(email)) {
    throw new Error(t(
      'api/access/grant/email/error',
      { email }
    ))
  }

  const campaign = await campaignsLib.findOne(campaignId, pgdb)

  if (campaign === undefined) {
    throw new Error(t(
      'api/access/grant/campaign/error',
      { campaignId }
    ))
  }

  const result = await evaluateConstraints(grantee, campaign, email, t, pgdb)

  if (result.errors.length > 0) {
    throw new Error(result.errors.shift())
  }

  const endAt = moment()

  Object.keys(campaign.periodInterval).forEach(key => {
    endAt.add(campaign.periodInterval[key], key)
  })

  // throw new Error('Breakpoint')

  const grant = await pgdb.public.accessGrants.insertAndGet({
    granteeUserId: grantee.id,
    email,
    accessCampaignId: campaign.id,
    beginAt: moment(),
    endAt
  })

  eventsLib.log(grant, 'grant', pgdb)

  debug('grant, row inserted', { grant })

  await mailLib.sendRecipientOnboarding(grantee, campaign, grant, t, pgdb)

  await match(grant, pgdb, mail)

  return grant
}

const match = async (grant, pgdb, mail) => {
  const user = await pgdb.public.users.findOne({ email: grant.email })

  if (user) {
    await setRecipient(grant, user, pgdb)
    await eventsLib.log(grant, 'match', pgdb)
    const hasRoleChanged =
      await membershipsLib.addMemberRole(grant, user, pgdb)

    if (hasRoleChanged) {
      await mail.enforceSubscriptions({
        userId: user.id,
        pgdb
      })
    }

    debug('match', { grant })
  }
}

const revoke = async (id, user, t, pgdb) => {
  const grant = await pgdb.public.accessGrants.findOne({ id })
  const grantee = await pgdb.public.users.findOne({ id: grant.granteeUserId })

  if (!Roles.userIsMeOrInRoles(grantee, user, ['admin', 'supporter'])) {
    throw new Error(t('api/access/revoke/role/error'))
  }

  const updateFields = { revokedAt: moment(), updatedAt: moment() }
  const result = await pgdb.public.accessGrants.update(
    { id: grant.id, revokedAt: null, invalidatedAt: null },
    updateFields
  )

  await eventsLib.log(
    grant,
    grantee.id !== user.id ? 'revoked.admin' : 'revoked.user',
    pgdb
  )

  debug('revoke', {
    id: grant.id,
    ...updateFields
  })

  return result
}

const invalidate = async (grant, reason, t, pgdb, mail) => {
  const updateFields = { invalidatedAt: moment(), updatedAt: moment() }
  const result = await pgdb.public.accessGrants.update(
    { id: grant.id, invalidatedAt: null },
    updateFields
  )

  await eventsLib.log(grant, `invalidated.${reason}`, pgdb)

  if (grant.recipientUserId) {
    const recipient =
      await pgdb.public.users.findOne({ id: grant.recipientUserId })

    if (recipient) {
      const hasRoleChanged = await membershipsLib.removeMemberRole(
        grant,
        recipient,
        findByRecipient,
        pgdb
      )

      if (hasRoleChanged) {
        await mail.enforceSubscriptions({
          userId: recipient.id,
          pgdb
        })
      }

      const hasMembership =
        await membershipsLib.hasUserActiveMembership(recipient, pgdb)

      if (!hasMembership) {
        const grantee = await pgdb.public.users
          .findOne({ id: grant.granteeUserId })
        const campaign = await pgdb.public.accessCampaigns
          .findOne({ id: grant.accessCampaignId })

        await mailLib.sendRecipientExpired(
          grantee, campaign, recipient, grant, t, pgdb
        )
      }
    }
  }

  debug('invalidate', {
    id: grant.id,
    reason,
    hasRecipient: !!grant.recipientUserId,
    ...updateFields,
    result
  })

  return result > 0
}

const followUp = async (campaign, grant, t, pgdb, mail) => {
  const updateFields = { followupAt: moment(), updatedAt: moment() }
  const result = await pgdb.public.accessGrants.update(
    { id: grant.id, followupAt: null },
    updateFields
  )

  const recipient =
    await pgdb.public.users.findOne({ id: grant.recipientUserId })

  if (recipient) {
    const hasMembership =
      await membershipsLib.hasUserActiveMembership(recipient, pgdb)

    if (!hasMembership) {
      const grantee = await pgdb.public.users
        .findOne({ id: grant.granteeUserId })

      await mailLib.sendRecipientFollowup(
        grantee, campaign, recipient, grant, t, pgdb
      )
    }
  }

  debug('followUp', {
    id: grant.id,
    hasRecipient: !!grant.recipientUserId,
    ...updateFields,
    result
  })

  return result > 0
}

const findByGrantee = async (
  grantee,
  campaign,
  withRevoked,
  withInvalidated,
  pgdb
) => {
  debug(
    'findByGrantee', {
      grantee: grantee.id,
      campaign: campaign.id,
      withRevoked,
      withInvalidated
    }
  )

  const query = {
    granteeUserId: grantee.id,
    accessCampaignId: campaign.id,
    'beginAt <=': moment(),
    'endAt >': moment(),
    revokedAt: null,
    invalidatedAt: null
  }

  if (withRevoked) {
    query['beginAt <='] = undefined
    query['endAt >'] = undefined
    query.revokedAt = undefined
  }

  if (withInvalidated) {
    query['beginAt <='] = undefined
    query['endAt >'] = undefined
    query.invalidatedAt = undefined
  }

  return pgdb.public.accessGrants.find(
    query,
    {
      orderBy: { createdAt: 'asc' },
      skipUndefined: true
    }
  )
}

const findByRecipient = async (recipient, { withPast, pgdb }) => {
  debug('findByRecipient', { recipient: recipient.id, withPast })
  const condition = {
    recipientUserId: recipient.id,
    'beginAt <=': moment(),
    invalidatedAt: null
  }

  if (!withPast) {
    condition['endAt >'] = moment()
  }

  const grants =
    await pgdb.public.accessGrants.find(condition)

  return grants
}

const findUnassigned = async (pgdb) => {
  debug('findUnassigend')
  return pgdb.public.accessGrants.find({
    recipientUserId: null,
    'beginAt <=': moment(),
    'endAt >': moment(),
    invalidatedAt: null
  })
}

const findUnassignedByEmail = async (email, pgdb) => {
  debug('findUnassigend', { email })
  return pgdb.public.accessGrants.find({
    email,
    recipientUserId: null,
    'beginAt <=': moment(),
    'endAt >': moment(),
    invalidatedAt: null
  })
}

const findExpired = async (pgdb) => {
  debug('findExpired')
  return pgdb.public.accessGrants.find({
    'endAt <': moment(),
    invalidatedAt: null
  })
}

const setRecipient = async (grant, recipient, pgdb) => {
  const updateFields = { recipientUserId: recipient.id, updatedAt: moment() }
  const result = await pgdb.public.accessGrants.update(
    { id: grant.id },
    updateFields
  )

  debug('setRecipient', {
    id: grant.id,
    ...updateFields,
    result
  })

  return result > 0
}

const findEmptyFollowup = async (campaign, pgdb) => {
  const invalidateBefore = moment()

  Object
    .keys(campaign.emailFollowup)
    .forEach(
      unit => invalidateBefore.subtract(campaign.emailFollowup[unit], unit)
    )

  debug('findEmptyFollowup', { campaign: campaign.id, invalidateBefore })

  return pgdb.public.accessGrants.find({
    accessCampaignId: campaign.id,
    'invalidatedAt <': invalidateBefore,
    followupAt: null
  })
}

module.exports = {
  grant,
  match,
  revoke,
  invalidate,
  followUp,

  findByGrantee,
  findByRecipient,

  findUnassigned,
  findUnassignedByEmail,
  findExpired,
  findEmptyFollowup,

  setRecipient
}
