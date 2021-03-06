const debug = require('debug')('crowdfundings:lib:CustomPackages:rule:earlyUserBonus')
const moment = require('moment')
const uuid = require('uuid/v4')

const { getPeriodEndingLast } = require('../../utils')

const MEMBERSHIP_CREATED_BEFORE = '2017-04-27'
const PACKAGE_ELIGABLE = ['ABO', 'BENEFACTOR']

module.exports = ({ package_, packageOption, membership, payload, now }) => {
  if (membership.createdAt >= moment(MEMBERSHIP_CREATED_BEFORE)) {
    debug(
      'membership.createdAt not within early adopter range (< %s)',
      MEMBERSHIP_CREATED_BEFORE
    )
    return
  }

  if (membership.pledge.userId !== package_.user.id) {
    debug('membership not pledged by user. rule does not apply.')
    return
  }

  if (!PACKAGE_ELIGABLE.includes(membership.pledge.package.name)) {
    debug(
      'package "%s" is not eligable for early adopter bonus',
      membership.pledge.package.name
    )
    return
  }

  if (payload.additionalPeriods.length === 0) {
    debug(
      'no additional periods found. rule does not apply.',
      payload.additionalPeriods.length
    )
    return
  }

  if (membership.membershipPeriods.length >= 3) {
    debug(
      'too many membership periods found. rule does not apply.',
      payload.additionalPeriods.length
    )
    return
  }

  const { beginDate, endDate } =
    getPeriodEndingLast(payload.additionalPeriods)

  const bonus = moment
    .duration(moment(beginDate).diff(now))
    .add(1, 'day')

  debug('%d days granted. role applied.', Math.floor(bonus.asDays()))

  payload.additionalPeriods.push({
    id: uuid(),
    membershipId: membership.id,
    kind: 'BONUS',
    beginDate: endDate,
    endDate: moment(endDate).add(bonus),
    createdAt: now,
    updatedAt: now
  })
}
