

const Invites = require('scuttle-invite')
const ref = require('ssb-ref')
const pull = require('pull-stream')
const { isInvite, isReply } = require('scuttle-invite-schema')
const pullRitual = require('../../ritual/pull/mine')
const { box } = require('ssb-keys')
const secrets = require('secrets.js-grempe')
const getContent = require('ssb-msg-content')

module.exports = function (server) {
  const invites = Invites(server)

  return function recombine (rootId, callback) {
    if (!ref.isMsgId(rootId)) return callback(new Error('Invalid rootId'))

    const findAssociatedMessages = (type) => {
      return {
        query: [{
          $filter: {
            value: {
              content: {
                type,
                root: rootId
              }
            }
          }
        }]
      }
    }
    
    // get the quorum from the ritual message
    // TODO: use
    // pullRitual( need to give the rootId to opts ) )    
    
    var encryptedShards = {}

    pull(
      server.query.read(findAssociatedMessages('dark-crystal/ritual')),
      pull.collect((err, rituals) => {
        // TODO: verify rituals.length === 1
        var quorum = getContent(rituals[0]).quorum

        pull(
          server.query.read(findAssociatedMessages('dark-crystal/shard')),
          pull.drain((shardMsg) => {
            encryptedShards[shardMsg.value.author] = getContent(shardMsg).shard
          }, gotAllShards(encryptedShards))
        )
      })
    )

  }
}


function gotAllShards(encryptedShards) {
  
  pull(
    server.query.read(findAssociatedMessages('invite-reply')),
    pull.map((replyMsg) => {

      var shard = getContent(replyMsg).body

      // TODO: this unboxed shard validation should be moved
      // to a separate method so that it can be used independently

      // validate that shard is a shard using secrets.js 
      try {
        var shardComponents = secrets.extractShareComponents(shard)
      }
      catch (err) {
        return callback(err)
      }
   
      // verify that the shard is the shard we sent
      if (encryptedShards[replyMsg.author] != box(shard, [replyMsg.author]))
         return callback(new Error('Recieved shard does not match given shard for shardholder ',replyMsg.author))

      return shard 
    }),
    pull.collect((err, shards) => {
      if (shards.length < quorum) return callback(new Error('Not enough shards to recombine'))
      try {
        secret = secrets.combine(shards) 
      } 
      catch (err) {
        return callback(err)
      }
      callback(null,secret)
    })
  )
}