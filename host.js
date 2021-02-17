const SpakeChannel = require('spake2-peer/spake')
const assert = require('nanoassert')
const pump = require('pump')

const rpc = require('./rpc')
const Decode = require('./frame')

module.exports = class Host {
  constructor (id, clients, storage) {
    assert(typeof clients.get === 'function')
    assert(typeof clients.set === 'function')

    this.id = id
    this.clients = clients
    this.storage = storage
  }

  createServer (opts = {}, onrequest) {
    const self = this

    const onerror = opts.onerror || throwMaybe
    if (!onrequest) onrequest = rpc.bind(this)

    const connect = opts.connect

    return connect(socket => {
      const recv = new Decode()

      pump(socket, recv)

      recv.on('data', onmessage)

      function onmessage (msg) {
        const { method, username, data } = JSON.parse(msg)

        switch (method) {
          case 'BACKPACK_CONNECT' :
            self._connect(username, socket, onchannel)
            recv.removeListener('data', onmessage)
            break

          case 'BACKPACK_REGISTER' :
            self.register(username, data)
            break
        }
      }
    })

    function onchannel (err, channel) {
      if (err) return onerror(err)
      channel.on('data', ondata)

      function ondata (data) {
        try {
          const req = JSON.parse(data)
          onrequest(req, channel, onerror)
        } catch (e) {
          if (e.name !== 'SyntaxError') return onerror(err)
        }
      }
    }

    function throwMaybe (err) {
      if (err) throw err
    }
  }

  register (username, info) {
    this.clients.set(username, info)
  }

  download (username, res, cb) {
    console.log(username)
    if (!cb) cb = noop

    const str = this.storage.createReadStream(username)
    pump(str, res, cb)
  }

  upload (username, req, cb) {
    if (!cb) cb = noop

    const str = this.storage.createWriteStream(username)
    pump(req, str, cb)
  }

  _connect (username, connection, cb) {
    const id = this.id
    const data = this.clients.get(username)

    const channel = new SpakeChannel.Server({ id }, {
      username,
      data
    }, { res: connection, req: connection })

    cb(null, channel)
  }
}

function noop () {}