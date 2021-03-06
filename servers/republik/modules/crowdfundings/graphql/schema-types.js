module.exports = `

scalar DateTime
scalar JSON

extend type User {
  pledges: [Pledge!]!
  memberships: [Membership!]!

  paymentSources: [PaymentSource!]!
  hasChargableSource: Boolean

  # Custom-tailored packages available for User
  customPackages(crowdfundingName: String): [Package!]
  # Whether User is eligable to profit from additional BONUS periods
  isBonusEligable: Boolean!
  # Prolong before give date to unsure uninterrupted access
  prolongBeforeDate: DateTime

  # if true the user should check his/her memberships subscriptions
  # most propably she has a running monthly- and yealy-membership simultaneously
  checkMembershipSubscriptions: Boolean!

  # notes by the support team
  # required role: supporter
  adminNotes: String
}

type Crowdfunding {
  id: ID!
  name: String!
  beginDate: DateTime!
  endDate: DateTime!
  endVideo: Video
  hasEnded: Boolean!
  goals: [CrowdfundingGoal!]!
  status: CrowdfundingStatus!
  packages: [Package!]!
  createdAt: DateTime!
  updatedAt: DateTime!
}
type CrowdfundingGoal {
  money: Int!
  people: Int!
  description: String
}
type CrowdfundingStatus {
  money: Int!
  people: Int!
}

type Package {
  id: ID!
  name: String!
  options: [PackageOption!]!
  paymentMethods: [PaymentMethod!]!
  createdAt: DateTime!
  updatedAt: DateTime!
}

type PackageOption {
  id: ID! # unique ID
  templateId: ID! # package option ID
  package: Package!
  reward: Reward
  minAmount: Int!
  maxAmount: Int
  defaultAmount: Int!
  price: Int!
  vat: Int!
  minUserPrice: Int!
  userPrice: Boolean!
  createdAt: DateTime!
  updatedAt: DateTime!

  # for pledgeOptions
  amount: Int

  # for custom packages
  optionGroup: String
  membership: Membership
  autoPay: Boolean
  additionalPeriods: [MembershipPeriod!]
}

input PackageOptionInput {
  amount: Int!
  price: Int!
  templateId: ID! # packageOption.id

  # via custom packages
  membershipId: ID
  autoPay: Boolean
}

type Goodie {
  id: ID!
  name: String!
  createdAt: DateTime!
  updatedAt: DateTime!
}

enum MembershipTypeInterval {
  year
  month
  day
}

type MembershipType {
  id: ID!
  name: String!
  interval: MembershipTypeInterval
  intervalCount: Int!
  createdAt: DateTime!
  updatedAt: DateTime!
}

type Membership {
  id: ID!
  type: MembershipType!
  pledge: Pledge!
  voucherCode: String
  reducedPrice: Boolean!
  claimerName: String
  user: User!
  sequenceNumber: Int
  active: Boolean!
  renew: Boolean!
  autoPay: Boolean!
  periods: [MembershipPeriod]!
  overdue: Boolean!
  cancellations: [Cancellation!]!
  createdAt: DateTime!
  updatedAt: DateTime!
}

enum MembershipPeriodKind {
  REGULAR
  BONUS # Bonus period upon checkout
  ADMIN # A bonus period granted via admins, supporter
}

type MembershipPeriod {
  id: ID!
  membership: Membership!
  kind: MembershipPeriodKind!
  beginDate: DateTime!
  endDate: DateTime!
  createdAt: DateTime!
  updatedAt: DateTime!
}

union Reward = Goodie | MembershipType

input UserInput {
  email: String!
  firstName: String!
  lastName: String!
  birthday: Date
  phoneNumber: String
}
#input AddressInput {
#  name: String!
#  line1: String!
#  line2: String
#  postalCode: String!
#  city: String!
#  country: String!
#}

enum PledgeStatus {
  DRAFT
  WAITING_FOR_PAYMENT
  PAID_INVESTIGATE
  SUCCESSFUL
  CANCELLED
}
type Pledge {
  id: ID!
  package: Package!
  options: [PackageOption!]!
  status: PledgeStatus!
  total: Int!
  donation: Int!
  payments: [PledgePayment!]!
  user: User!
  reason: String
  memberships: [Membership!]!
  createdAt: DateTime!
  updatedAt: DateTime!
}

input PledgeInput {
  options: [PackageOptionInput!]!
  total: Int!
  user: UserInput!
  reason: String
  accessToken: ID
}

type PledgeResponse {
  pledgeId: ID
  userId: ID
  emailVerify: Boolean
  pfAliasId: String
  pfSHA: String
}

input PledgePaymentInput {
  pledgeId: ID!
  method: PaymentMethod!
  paperInvoice: Boolean
  sourceId: String
  pspPayload: JSON
  address: AddressInput
}

enum PaymentMethod {
  STRIPE
  POSTFINANCECARD
  PAYPAL
  PAYMENTSLIP
}
enum PaymentStatus {
  WAITING
  PAID
  WAITING_FOR_REFUND
  REFUNDED
  CANCELLED
}
type PledgePayment {
  id: ID!
  method: PaymentMethod!
  paperInvoice: Boolean!
  total: Int!
  status: PaymentStatus!
  hrid: String
  pspId: String
  dueDate: DateTime
  # every payment should link to
  # a user, but there is some cleanup
  # to do, to make that reality
  user: User
  remindersSentAt: [DateTime!]
  createdAt: DateTime!
  updatedAt: DateTime!
}

type PledgePayments {
  items: [PledgePayment!]!
  count: Int!
}

enum PaymentSourceStatus {
  CANCELED
  CHARGEABLE
  CONSUMED
  FAILED
  PENDING
}
type PaymentSource {
  id: String!
  isDefault: Boolean!
  status: PaymentSourceStatus!
  brand: String!
  last4: String!
  expMonth: Int!
  expYear: Int!
  # is source expired now
  isExpired: Boolean!
}

enum CancellationCategoryType {
  EDITORIAL,
  NO_TIME,
  TOO_EXPENSIVE,
  VOID,
  OTHER,
  SYSTEM
}

type CancellationCategory {
  type: CancellationCategoryType!
  label: String!
}

input CancellationInput {
  type: CancellationCategoryType!
  reason: String
}

type Cancellation {
  reason: String
  category: CancellationCategory!
  createdAt: DateTime!
  revokedAt: DateTime
}

######################################
# admin
######################################

input DateRangeFilter {
  field: Field!
  from: DateTime!
  to: DateTime!
}
input StringArrayFilter {
  field: Field!
  values: [String!]!
}
input BooleanFilter {
  field: Field!
  value: Boolean!
}

enum Field {
  createdAt
  updatedAt
  dueDate
  status
  matched
  paperInvoice
  verified
  email
  buchungsdatum
  valuta
  avisierungstext
  gutschrift
  mitteilung
  hrid
  total
  method
  firstName
  lastName
  hidden
}

input OrderBy {
  field: Field!
  direction: OrderDirection!
}

type Users {
  items: [User!]!
  count: Int!
}

type PostfinancePayment {
  id: ID!
  buchungsdatum: Date!
  valuta: Date!
  avisierungstext: String!
  gutschrift: Int!
  mitteilung: String
  matched: Boolean!
  hidden: Boolean!
  createdAt: DateTime!
  updatedAt: DateTime!
}

type PostfinancePayments {
  items: [PostfinancePayment!]!
  count: Int!
}
`
