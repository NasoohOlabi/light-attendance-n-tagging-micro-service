import { createServer } from 'node:net'

export function availablePort() {
  return new Promise<number>((resolve, reject) => {
    const listener = createServer()
    listener.once('error', reject)
    listener.listen(0, '127.0.0.1', () => {
      const address = listener.address()
      listener.close((error) => {
        if (error) reject(error)
        else if (address && typeof address !== 'string') resolve(address.port)
        else reject(new Error('Missing synthetic server port'))
      })
    })
  })
}
