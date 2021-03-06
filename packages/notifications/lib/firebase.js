// https://firebase.google.com/docs/cloud-messaging/admin/legacy-fcm?authuser=1
// https://firebase.google.com/docs/cloud-messaging/admin/send-messages?authuser=1#defining_the_message

const firebase = require('firebase-admin')
const debug = require('debug')('notifications:publish:firebase')

const {
  SEND_NOTIFICATIONS,
  FIREBASE_PROJECT_ID,
  FIREBASE_CLIENT_EMAIL,
  FIREBASE_PRIVATE_KEY,
  FIREBASE_DATABASE_URL
} = process.env

const DEV = process.env.NODE_ENV && process.env.NODE_ENV !== 'production'

let initialized
if (!FIREBASE_PROJECT_ID || !FIREBASE_CLIENT_EMAIL || !FIREBASE_PRIVATE_KEY || !FIREBASE_DATABASE_URL) {
  console.log('missing env FIREBASE_*, sending push notifications via firebase will not work')
} else {
  // singleton
  firebase.initializeApp({
    credential: firebase.credential.cert({
      projectId: FIREBASE_PROJECT_ID,
      clientEmail: FIREBASE_CLIENT_EMAIL,
      privateKey: FIREBASE_PRIVATE_KEY
        .replace(/@/g, '\n')
        .replace(/\\\s/g, ' ')
    }),
    databaseURL: FIREBASE_DATABASE_URL
  })
  initialized = true
}

const publish = async (args) => {
  if (SEND_NOTIFICATIONS === 'false' || (DEV && SEND_NOTIFICATIONS !== 'true')) {
    console.log('\n\nSEND_NOTIFICATIONS prevented notification from being sent\n(SEND_NOTIFICATIONS == false or NODE_ENV != production and SEND_NOTIFICATIONS != true)\n', args)
    return
  }
  if (!initialized) {
    throw new Error(`mssing env FIREBASE_*, can't publish`)
  }

  const { tokens, title, body, url, icon, type, ttl, priority } = args

  if (tokens.length > 0) {
    const message = {
      notification: {
        title,
        body
      },
      data: {
        url,
        type,
        ...icon
          ? { icon }
          : {}
      }
    }
    const options = {
      ...ttl ? { timeToLive: parseInt(ttl / 1000) } : {},
      ...priority ? { priority } : {}
    }
    const result = await firebase.messaging().sendToDevice(
      tokens,
      message,
      options
    )
    debug('#recipients %d, message: %O, result: %O', tokens.length, message, result)
  } else {
    debug('no receipients found for publish: %O', args)
  }
}

module.exports = {
  publish
}
