# Wallet API

## createUnsignedTransaction
- `recipient` Publickey of the recipient (string)
- `payment` amount
- `fee` to send with tx
* returns `saito.transaction` if successful
* returns `null` if inadequate inputs

Create a transaction with the appropriate slips given the desired fee and payment to associate with the transaction, and a change address to receive any surplus tokens.

## createUnsignedTransactionWithDefaultFee
* `recipient` Publickey of the recipient (string)
* `fee` to send with tx
* returns `saito.transaction` if successful
* returns `null` if inadequate inputs

Create a transaction with the appropriate slips given the desired fee and payment to associate with the transaction, and a change address to receive any surplus tokens. Use the default wallet fee.

## signTransaction
* `tx` Saito transaction to sign
* returns `saito.transaction` Signed Saito transaction

Signs a transaction using the wallet private key.

## signMessage
* `msg` string to sign
* returns `string` public key

Signs a msg string using the wallet private key.

## returnBalance
- returns `double` balance

Returns wallet's balance

## returnDefaultFee
- returns `double` fee

Returns wallet's default fee

## returnPublicKey
- returns `string` public key

Returns wallet's public key

## returnPrivateKey
- returns `string` private key

Returns wallet's private key

## returnIdentifier
- returns `string` identifier

If exists, Return the default identifier associated with a wallet