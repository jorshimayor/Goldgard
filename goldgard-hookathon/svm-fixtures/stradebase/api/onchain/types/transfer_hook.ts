/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/transfer_hook.json`.
 */
export type TransferHook = {
  "address": "pk9fzHd77xiV5w5mqEsjfa8RKjdye9t9hY8W2VBUpEV",
  "metadata": {
    "name": "transferHook",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Token-2022 transfer-hook compliance program for Stradebase royalty shares"
  },
  "instructions": [
    {
      "name": "initializeExtraAccountMetaList",
      "docs": [
        "Create the ExtraAccountMetaList PDA that tells Token-2022 which extra",
        "accounts to pass into `Execute`. Call once per share mint."
      ],
      "discriminator": [
        92,
        197,
        174,
        197,
        41,
        124,
        19,
        3
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "extraAccountMetaList",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  120,
                  116,
                  114,
                  97,
                  45,
                  97,
                  99,
                  99,
                  111,
                  117,
                  110,
                  116,
                  45,
                  109,
                  101,
                  116,
                  97,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "mint"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "transferHook",
      "docs": [
        "The compliance gate. Invoked by Token-2022 during every share transfer."
      ],
      "discriminator": [
        220,
        57,
        220,
        152,
        126,
        125,
        97,
        168
      ],
      "accounts": [
        {
          "name": "sourceToken"
        },
        {
          "name": "mint"
        },
        {
          "name": "destinationToken"
        },
        {
          "name": "owner"
        },
        {
          "name": "extraAccountMetaList",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  120,
                  116,
                  114,
                  97,
                  45,
                  97,
                  99,
                  99,
                  111,
                  117,
                  110,
                  116,
                  45,
                  109,
                  101,
                  116,
                  97,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "royaltySharesProgram",
          "address": "mWG6dhh3iZpTbdjxhc7k8PwqLKkKUFekcWqWRUNXruZ"
        },
        {
          "name": "globalConfig"
        },
        {
          "name": "complianceConfig"
        },
        {
          "name": "sourceIdentity"
        },
        {
          "name": "destinationIdentity"
        },
        {
          "name": "sourcePosition"
        },
        {
          "name": "listing",
          "docs": [
            "deserialized + ownership-checked in the handler."
          ]
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "globalPaused",
      "msg": "Platform is globally paused"
    },
    {
      "code": 6001,
      "name": "sanctioned",
      "msg": "Account is on this listing's blocked list"
    },
    {
      "code": 6002,
      "name": "complianceBlocked",
      "msg": "Account is restricted or frozen by compliance"
    },
    {
      "code": 6003,
      "name": "kycRequired",
      "msg": "Recipient has not completed the required KYC"
    },
    {
      "code": 6004,
      "name": "exceedsWalletCap",
      "msg": "Transfer would exceed the per-wallet ownership cap"
    },
    {
      "code": 6005,
      "name": "lockupActive",
      "msg": "Mandatory lockup period is still active"
    },
    {
      "code": 6006,
      "name": "exceedsGlobalCap",
      "msg": "Transfer would exceed the global ownership cap"
    },
    {
      "code": 6007,
      "name": "accreditationRequired",
      "msg": "Recipient must be an accredited investor for this listing"
    },
    {
      "code": 6008,
      "name": "jurisdictionNotAllowed",
      "msg": "Recipient's jurisdiction is not permitted for this listing"
    },
    {
      "code": 6009,
      "name": "mathOverflow",
      "msg": "Arithmetic overflow"
    },
    {
      "code": 6010,
      "name": "invalidComplianceAccount",
      "msg": "A required compliance account is missing or not owned by the royalty program"
    }
  ]
};
