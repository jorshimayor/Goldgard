/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/royalty_shares.json`.
 */
export type RoyaltyShares = {
  "address": "mWG6dhh3iZpTbdjxhc7k8PwqLKkKUFekcWqWRUNXruZ",
  "metadata": {
    "name": "royaltyShares",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Fractional music royalty ownership (RWA) program for Stradebase"
  },
  "docs": [
    "Instruction entrypoints. Each is a thin wrapper that delegates to its module's",
    "`handler`; the real logic (and the account validation via `#[derive(Accounts)]`)",
    "lives under [`instructions`]."
  ],
  "instructions": [
    {
      "name": "blockUser",
      "docs": [
        "Add a wallet to a listing's blocked list (sanctions / AML freeze)."
      ],
      "discriminator": [
        10,
        164,
        178,
        6,
        231,
        175,
        185,
        191
      ],
      "accounts": [
        {
          "name": "complianceAuthority",
          "signer": true,
          "relations": [
            "globalConfig"
          ]
        },
        {
          "name": "globalConfig",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108,
                  95,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "complianceConfig",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  109,
                  112,
                  108,
                  105,
                  97,
                  110,
                  99,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "complianceConfig.shareMint",
                "account": "complianceConfig"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "user",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "buyShares",
      "docs": [
        "Primary issuance. Runs the full compliance gate on the buyer, mints the shares to",
        "them (signed by the listing PDA), opens/extends their",
        "[`HolderPosition`](state::HolderPosition) (lockup), and writes an immutable",
        "[`TradeRecord`](state::TradeRecord).",
        "",
        "**Moves no money.** The API settles payment off-chain first; `settlement_amount` and",
        "`payment_tx_hash` are recorded here as the audit reference (`payment_tx_hash` is a",
        "caller-supplied off-ramp id, *not* an on-chain signature)."
      ],
      "discriminator": [
        40,
        239,
        138,
        154,
        8,
        37,
        106,
        108
      ],
      "accounts": [
        {
          "name": "buyer",
          "writable": true,
          "signer": true
        },
        {
          "name": "globalConfig",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108,
                  95,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "listing",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  105,
                  115,
                  116,
                  105,
                  110,
                  103
                ]
              },
              {
                "kind": "account",
                "path": "listing.artist",
                "account": "songListing"
              },
              {
                "kind": "account",
                "path": "listing.songId",
                "account": "songListing"
              }
            ]
          }
        },
        {
          "name": "buyerIdentity",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  105,
                  100,
                  101,
                  110,
                  116,
                  105,
                  116,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "buyer"
              }
            ]
          }
        },
        {
          "name": "complianceConfig",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  109,
                  112,
                  108,
                  105,
                  97,
                  110,
                  99,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "shareMint"
              }
            ]
          }
        },
        {
          "name": "shareMint",
          "writable": true
        },
        {
          "name": "buyerShareAta",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "buyer"
              },
              {
                "kind": "account",
                "path": "token2022Program"
              },
              {
                "kind": "account",
                "path": "shareMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "position",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "shareMint"
              },
              {
                "kind": "account",
                "path": "buyer"
              }
            ]
          }
        },
        {
          "name": "buyerProfile",
          "docs": [
            "The buyer's platform profile (created at signup). Its trade counter is bumped here;",
            "full per-user history comes from indexing `TradeRecord` by `from`/`to`."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  117,
                  115,
                  101,
                  114,
                  95,
                  112,
                  114,
                  111,
                  102,
                  105,
                  108,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "buyer"
              }
            ]
          }
        },
        {
          "name": "tradeRecord",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  97,
                  100,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "listing"
              },
              {
                "kind": "account",
                "path": "listing.totalTrades",
                "account": "songListing"
              }
            ]
          }
        },
        {
          "name": "token2022Program",
          "address": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "sharesAmount",
          "type": "u64"
        },
        {
          "name": "settlementAmount",
          "type": "u64"
        },
        {
          "name": "paymentTxHash",
          "type": {
            "array": [
              "u8",
              64
            ]
          }
        }
      ]
    },
    {
      "name": "claimUsername",
      "docs": [
        "Claim a public username (`[a-z0-9_]{3,32}`) for the signer's profile. Uniqueness is",
        "enforced by the runtime: the claim record is a PDA seeded by the name, so a second",
        "claim on a taken name fails at `init`. Signed by the user — publishing a handle",
        "against an address is a privacy decision, so it is never made on their behalf."
      ],
      "discriminator": [
        161,
        41,
        99,
        255,
        196,
        83,
        221,
        148
      ],
      "accounts": [
        {
          "name": "payer",
          "docs": [
            "Funds the rent — the platform fee payer, or the user themselves."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "user",
          "docs": [
            "The wallet claiming the name. Signs to prove consent: publishing a handle against",
            "an address is a privacy decision, so it can't be made for someone."
          ],
          "signer": true,
          "relations": [
            "profile"
          ]
        },
        {
          "name": "profile",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  117,
                  115,
                  101,
                  114,
                  95,
                  112,
                  114,
                  111,
                  102,
                  105,
                  108,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "user"
              }
            ]
          }
        },
        {
          "name": "usernameRecord",
          "docs": [
            "The claim itself. `init` here is the uniqueness check — see the module docs."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  117,
                  115,
                  101,
                  114,
                  110,
                  97,
                  109,
                  101
                ]
              },
              {
                "kind": "arg",
                "path": "username"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "username",
          "type": "string"
        }
      ]
    },
    {
      "name": "createListing",
      "docs": [
        "Artist creates a song card. Allocates the Token-2022 share mint with the",
        "**TransferHook** + **MetadataPointer** extensions (so every future transfer runs",
        "compliance and the mint points back at this listing), the SBST royalty vault, and",
        "the per-listing [`ComplianceConfig`](state::ComplianceConfig). The mint authority is",
        "the listing PDA, so only [`buy_shares`] can issue shares."
      ],
      "discriminator": [
        18,
        168,
        45,
        24,
        191,
        31,
        117,
        54
      ],
      "accounts": [
        {
          "name": "artist",
          "docs": [
            "Artist creating the listing. Signs, and pays rent for the listing / mint / vault /",
            "compliance accounts. Becomes `listing.artist` and the primary-sale payee."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "globalConfig",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108,
                  95,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "artistProfile",
          "docs": [
            "The artist's platform profile. Must exist and carry an Artist/Both role — this is the",
            "\"only Artist or Both may create listings\" rule. Counter is bumped in the handler."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  117,
                  115,
                  101,
                  114,
                  95,
                  112,
                  114,
                  111,
                  102,
                  105,
                  108,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "artist"
              }
            ]
          }
        },
        {
          "name": "listing",
          "docs": [
            "The new listing PDA, namespaced by `(artist, song_id)` so two artists can't collide."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  105,
                  115,
                  116,
                  105,
                  110,
                  103
                ]
              },
              {
                "kind": "account",
                "path": "artist"
              },
              {
                "kind": "arg",
                "path": "params.songId"
              }
            ]
          }
        },
        {
          "name": "shareMint",
          "docs": [
            "can't add extensions — the handler allocates + initializes it manually. It is still",
            "a verified PDA via `seeds`, and its address depends on `listing`, so it's unique."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  104,
                  97,
                  114,
                  101,
                  95,
                  109,
                  105,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "listing"
              }
            ]
          }
        },
        {
          "name": "complianceConfig",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  109,
                  112,
                  108,
                  105,
                  97,
                  110,
                  99,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "shareMint"
              }
            ]
          }
        },
        {
          "name": "transferHookProgram"
        },
        {
          "name": "token2022Program",
          "address": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "params",
          "type": {
            "defined": {
              "name": "createListingParams"
            }
          }
        }
      ]
    },
    {
      "name": "createUserProfile",
      "docs": [
        "User onboarding: create the platform profile that records a wallet's role",
        "(Artist / Investor / Both) and activity counters. Signed by the user (the custodial",
        "backend can sign on their behalf at signup); `payer` funds the rent."
      ],
      "discriminator": [
        9,
        214,
        142,
        184,
        153,
        65,
        50,
        174
      ],
      "accounts": [
        {
          "name": "payer",
          "docs": [
            "Funds the rent (the platform's fee payer, or the user themselves)."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "user",
          "docs": [
            "The wallet the profile is for. Signs to prove consent."
          ],
          "signer": true
        },
        {
          "name": "profile",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  117,
                  115,
                  101,
                  114,
                  95,
                  112,
                  114,
                  111,
                  102,
                  105,
                  108,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "user"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "role",
          "type": {
            "defined": {
              "name": "userRole"
            }
          }
        }
      ]
    },
    {
      "name": "initializeGlobal",
      "docs": [
        "Deploy-once platform bootstrap. Gated to the program's **upgrade authority**",
        "(see `InitializeGlobal`) so the singleton can't be seized by a front-runner.",
        "The signer becomes the ops `authority`."
      ],
      "discriminator": [
        47,
        225,
        15,
        112,
        86,
        51,
        190,
        231
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "globalConfig",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108,
                  95,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "program",
          "address": "mWG6dhh3iZpTbdjxhc7k8PwqLKkKUFekcWqWRUNXruZ"
        },
        {
          "name": "programData"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "params",
          "type": {
            "defined": {
              "name": "initializeGlobalParams"
            }
          }
        }
      ]
    },
    {
      "name": "recordDistribution",
      "docs": [
        "Record a royalty distribution the platform paid **off-chain** (pro-rata on live",
        "balances). Writes a [`DistributionRecord`](state::DistributionRecord); moves no funds.",
        "`merkle_root` may commit to the per-holder payout list (all-zero = none). Ops-gated."
      ],
      "discriminator": [
        35,
        239,
        115,
        184,
        162,
        108,
        209,
        36
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true,
          "relations": [
            "globalConfig"
          ]
        },
        {
          "name": "globalConfig",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108,
                  95,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "listing",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  105,
                  115,
                  116,
                  105,
                  110,
                  103
                ]
              },
              {
                "kind": "account",
                "path": "listing.artist",
                "account": "songListing"
              },
              {
                "kind": "account",
                "path": "listing.songId",
                "account": "songListing"
              }
            ]
          }
        },
        {
          "name": "distribution",
          "docs": [
            "Sequential per-listing record; `init` on the current index guarantees uniqueness and",
            "prevents a replay from overwriting a prior distribution."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  105,
                  115,
                  116,
                  114,
                  105,
                  98,
                  117,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "listing"
              },
              {
                "kind": "account",
                "path": "listing.totalDistributions",
                "account": "songListing"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "totalAmount",
          "type": "u64"
        },
        {
          "name": "merkleRoot",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "reference",
          "type": {
            "array": [
              "u8",
              64
            ]
          }
        }
      ]
    },
    {
      "name": "recordSecondaryTrade",
      "docs": [
        "Record a **secondary** (resale) trade on the ledger. Sent by the API in the same",
        "transaction as the Token-2022 transfer; the handler introspects the tx and requires a",
        "matching transfer (mint + amount + seller authority) to exist before writing the",
        "[`TradeRecord`](state::TradeRecord), so the on-chain history stays bound to real transfers.",
        "Uses the same `[\"trade\", listing, index]` space as primary sales → one unified history."
      ],
      "discriminator": [
        247,
        209,
        164,
        202,
        16,
        66,
        214,
        77
      ],
      "accounts": [
        {
          "name": "seller",
          "docs": [
            "The seller — the transfer authority. Signs (the API holds the custodial key) and pays the",
            "record's rent. Requiring the seller's signature ties the ledger entry to the party that",
            "actually authorized the share movement."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "listing",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  105,
                  115,
                  116,
                  105,
                  110,
                  103
                ]
              },
              {
                "kind": "account",
                "path": "listing.artist",
                "account": "songListing"
              },
              {
                "kind": "account",
                "path": "listing.songId",
                "account": "songListing"
              }
            ]
          }
        },
        {
          "name": "buyer"
        },
        {
          "name": "tradeRecord",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  97,
                  100,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "listing"
              },
              {
                "kind": "account",
                "path": "listing.totalTrades",
                "account": "songListing"
              }
            ]
          }
        },
        {
          "name": "instructions",
          "address": "Sysvar1nstructions1111111111111111111111111"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "sharesAmount",
          "type": "u64"
        },
        {
          "name": "settlementAmount",
          "type": "u64"
        },
        {
          "name": "paymentTxHash",
          "type": {
            "array": [
              "u8",
              64
            ]
          }
        }
      ]
    },
    {
      "name": "registerIdentity",
      "docs": [
        "Create or update a user's KYC/AML record. Compliance-authority gated.",
        "",
        "Personal data never lands on-chain: `params.pii_commitment` is a salted hash of the",
        "off-chain record (see `docs/architecture.md`). Only the jurisdiction — which",
        "the transfer hook needs to enforce listing rules — is stored in the clear."
      ],
      "discriminator": [
        164,
        118,
        227,
        177,
        47,
        176,
        187,
        248
      ],
      "accounts": [
        {
          "name": "complianceAuthority",
          "writable": true,
          "signer": true,
          "relations": [
            "globalConfig"
          ]
        },
        {
          "name": "globalConfig",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108,
                  95,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "user"
        },
        {
          "name": "identity",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  105,
                  100,
                  101,
                  110,
                  116,
                  105,
                  116,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "user"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "params",
          "type": {
            "defined": {
              "name": "registerIdentityParams"
            }
          }
        }
      ]
    },
    {
      "name": "releaseUsername",
      "docs": [
        "Give up a username, closing the claim record (rent refunded) and freeing the name."
      ],
      "discriminator": [
        216,
        163,
        188,
        29,
        37,
        50,
        178,
        65
      ],
      "accounts": [
        {
          "name": "user",
          "docs": [
            "Receives the reclaimed rent."
          ],
          "writable": true,
          "signer": true,
          "relations": [
            "profile"
          ]
        },
        {
          "name": "profile",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  117,
                  115,
                  101,
                  114,
                  95,
                  112,
                  114,
                  111,
                  102,
                  105,
                  108,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "user"
              }
            ]
          }
        },
        {
          "name": "usernameRecord",
          "docs": [
            "The `owner` constraint stops one wallet releasing another's name; `close` frees the",
            "address so the name becomes claimable again."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  117,
                  115,
                  101,
                  114,
                  110,
                  97,
                  109,
                  101
                ]
              },
              {
                "kind": "arg",
                "path": "username"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "username",
          "type": "string"
        }
      ]
    },
    {
      "name": "setGlobalPause",
      "docs": [
        "Global circuit breaker. Authority gated."
      ],
      "discriminator": [
        32,
        234,
        28,
        216,
        67,
        76,
        116,
        231
      ],
      "accounts": [
        {
          "name": "authority",
          "signer": true,
          "relations": [
            "globalConfig"
          ]
        },
        {
          "name": "globalConfig",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108,
                  95,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "paused",
          "type": "bool"
        }
      ]
    },
    {
      "name": "setListingStatus",
      "docs": [
        "Emergency: pause / resume / close a single listing. Authority gated."
      ],
      "discriminator": [
        98,
        66,
        57,
        95,
        13,
        152,
        159,
        154
      ],
      "accounts": [
        {
          "name": "authority",
          "signer": true,
          "relations": [
            "globalConfig"
          ]
        },
        {
          "name": "globalConfig",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108,
                  95,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "listing",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  105,
                  115,
                  116,
                  105,
                  110,
                  103
                ]
              },
              {
                "kind": "account",
                "path": "listing.artist",
                "account": "songListing"
              },
              {
                "kind": "account",
                "path": "listing.songId",
                "account": "songListing"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "status",
          "type": {
            "defined": {
              "name": "listingStatus"
            }
          }
        }
      ]
    },
    {
      "name": "setPiiCommitment",
      "docs": [
        "Re-commit to a user's PII after a re-verification, without touching their",
        "compliance status. Bumps `pii_version` only if the commitment actually changed."
      ],
      "discriminator": [
        223,
        124,
        45,
        6,
        153,
        176,
        84,
        200
      ],
      "accounts": [
        {
          "name": "complianceAuthority",
          "signer": true,
          "relations": [
            "globalConfig"
          ]
        },
        {
          "name": "globalConfig",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108,
                  95,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "identity",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  105,
                  100,
                  101,
                  110,
                  116,
                  105,
                  116,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "identity.user",
                "account": "identityRegistry"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "commitment",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "unblockUser",
      "docs": [
        "Remove a wallet from a listing's blocked list."
      ],
      "discriminator": [
        216,
        208,
        128,
        98,
        74,
        210,
        18,
        114
      ],
      "accounts": [
        {
          "name": "complianceAuthority",
          "signer": true,
          "relations": [
            "globalConfig"
          ]
        },
        {
          "name": "globalConfig",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108,
                  95,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "complianceConfig",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  109,
                  112,
                  108,
                  105,
                  97,
                  110,
                  99,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "complianceConfig.shareMint",
                "account": "complianceConfig"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "user",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "updateCompliance",
      "docs": [
        "Update a listing's per-wallet ownership cap."
      ],
      "discriminator": [
        219,
        3,
        160,
        220,
        171,
        41,
        244,
        196
      ],
      "accounts": [
        {
          "name": "complianceAuthority",
          "signer": true,
          "relations": [
            "globalConfig"
          ]
        },
        {
          "name": "globalConfig",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108,
                  95,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "complianceConfig",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  109,
                  112,
                  108,
                  105,
                  97,
                  110,
                  99,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "complianceConfig.shareMint",
                "account": "complianceConfig"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "maxSharesPerWallet",
          "type": "u64"
        }
      ]
    },
    {
      "name": "updatePlatformFee",
      "docs": [
        "Adjust the platform fee (basis points) taken on sales. Authority gated."
      ],
      "discriminator": [
        162,
        97,
        186,
        47,
        93,
        113,
        176,
        243
      ],
      "accounts": [
        {
          "name": "authority",
          "signer": true,
          "relations": [
            "globalConfig"
          ]
        },
        {
          "name": "globalConfig",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108,
                  95,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "platformFeeBps",
          "type": "u16"
        }
      ]
    },
    {
      "name": "updateUserRole",
      "docs": [
        "Change your own role (e.g. Investor → Both). Only the profile owner may call this."
      ],
      "discriminator": [
        71,
        250,
        233,
        60,
        60,
        174,
        150,
        125
      ],
      "accounts": [
        {
          "name": "user",
          "docs": [
            "Only the profile owner may change their own role."
          ],
          "signer": true,
          "relations": [
            "profile"
          ]
        },
        {
          "name": "profile",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  117,
                  115,
                  101,
                  114,
                  95,
                  112,
                  114,
                  111,
                  102,
                  105,
                  108,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "user"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "role",
          "type": {
            "defined": {
              "name": "userRole"
            }
          }
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "complianceConfig",
      "discriminator": [
        157,
        84,
        248,
        198,
        253,
        41,
        75,
        251
      ]
    },
    {
      "name": "distributionRecord",
      "discriminator": [
        28,
        78,
        148,
        216,
        131,
        101,
        91,
        151
      ]
    },
    {
      "name": "globalConfig",
      "discriminator": [
        149,
        8,
        156,
        202,
        160,
        252,
        176,
        217
      ]
    },
    {
      "name": "holderPosition",
      "discriminator": [
        48,
        115,
        169,
        131,
        27,
        29,
        223,
        126
      ]
    },
    {
      "name": "identityRegistry",
      "discriminator": [
        115,
        237,
        146,
        250,
        180,
        186,
        44,
        23
      ]
    },
    {
      "name": "songListing",
      "discriminator": [
        79,
        111,
        153,
        167,
        51,
        123,
        70,
        219
      ]
    },
    {
      "name": "tradeRecord",
      "discriminator": [
        150,
        248,
        182,
        169,
        229,
        100,
        24,
        37
      ]
    },
    {
      "name": "userProfile",
      "discriminator": [
        32,
        37,
        119,
        205,
        179,
        180,
        13,
        194
      ]
    },
    {
      "name": "usernameRecord",
      "discriminator": [
        42,
        172,
        136,
        41,
        240,
        123,
        100,
        204
      ]
    }
  ],
  "events": [
    {
      "name": "complianceUpdated",
      "discriminator": [
        196,
        6,
        124,
        206,
        58,
        250,
        107,
        157
      ]
    },
    {
      "name": "globalPauseChanged",
      "discriminator": [
        219,
        225,
        202,
        28,
        133,
        244,
        86,
        58
      ]
    },
    {
      "name": "identityRegistered",
      "discriminator": [
        5,
        243,
        147,
        84,
        8,
        116,
        238,
        24
      ]
    },
    {
      "name": "listingCreated",
      "discriminator": [
        94,
        164,
        167,
        255,
        246,
        186,
        12,
        96
      ]
    },
    {
      "name": "listingStatusChanged",
      "discriminator": [
        104,
        176,
        127,
        45,
        229,
        105,
        208,
        33
      ]
    },
    {
      "name": "piiCommitmentUpdated",
      "discriminator": [
        133,
        73,
        169,
        9,
        181,
        240,
        98,
        64
      ]
    },
    {
      "name": "platformFeeUpdated",
      "discriminator": [
        210,
        134,
        201,
        4,
        92,
        228,
        80,
        26
      ]
    },
    {
      "name": "royaltyDistributed",
      "discriminator": [
        102,
        185,
        143,
        143,
        73,
        29,
        36,
        41
      ]
    },
    {
      "name": "secondaryTradeRecorded",
      "discriminator": [
        216,
        216,
        31,
        105,
        181,
        3,
        27,
        238
      ]
    },
    {
      "name": "sharesPurchased",
      "discriminator": [
        24,
        220,
        223,
        28,
        213,
        182,
        47,
        22
      ]
    },
    {
      "name": "userBlocked",
      "discriminator": [
        216,
        184,
        7,
        34,
        247,
        56,
        201,
        241
      ]
    },
    {
      "name": "userProfileCreated",
      "discriminator": [
        175,
        83,
        79,
        167,
        6,
        194,
        72,
        125
      ]
    },
    {
      "name": "userRoleUpdated",
      "discriminator": [
        222,
        208,
        222,
        2,
        55,
        72,
        172,
        229
      ]
    },
    {
      "name": "userUnblocked",
      "discriminator": [
        205,
        140,
        210,
        131,
        161,
        149,
        159,
        237
      ]
    },
    {
      "name": "usernameClaimed",
      "discriminator": [
        44,
        186,
        0,
        104,
        43,
        52,
        89,
        31
      ]
    },
    {
      "name": "usernameReleased",
      "discriminator": [
        42,
        199,
        119,
        19,
        138,
        241,
        154,
        121
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
      "name": "listingNotActive",
      "msg": "Listing is not active"
    },
    {
      "code": 6002,
      "name": "saleNotStarted",
      "msg": "Listing sale window has not opened yet"
    },
    {
      "code": 6003,
      "name": "saleEnded",
      "msg": "Listing sale window has closed"
    },
    {
      "code": 6004,
      "name": "insufficientShares",
      "msg": "Not enough shares remaining in the listing"
    },
    {
      "code": 6005,
      "name": "invalidFeeBps",
      "msg": "Fee basis points exceed 100%"
    },
    {
      "code": 6006,
      "name": "invalidRoyaltySplit",
      "msg": "Royalty split percentages are invalid"
    },
    {
      "code": 6007,
      "name": "zeroAmount",
      "msg": "Amount must be greater than zero"
    },
    {
      "code": 6008,
      "name": "mathOverflow",
      "msg": "Arithmetic overflow"
    },
    {
      "code": 6009,
      "name": "unauthorized",
      "msg": "Signer is not authorized for this action"
    },
    {
      "code": 6010,
      "name": "kycRequired",
      "msg": "Buyer has not completed KYC to the required level"
    },
    {
      "code": 6011,
      "name": "accreditationRequired",
      "msg": "Buyer must be an accredited investor for this listing"
    },
    {
      "code": 6012,
      "name": "sanctioned",
      "msg": "Account is sanctioned / blocked"
    },
    {
      "code": 6013,
      "name": "jurisdictionNotAllowed",
      "msg": "Buyer's jurisdiction is not permitted for this listing"
    },
    {
      "code": 6014,
      "name": "exceedsWalletCap",
      "msg": "Purchase would exceed the per-wallet ownership cap"
    },
    {
      "code": 6015,
      "name": "exceedsGlobalCap",
      "msg": "Purchase would exceed the global ownership cap"
    },
    {
      "code": 6016,
      "name": "lockupActive",
      "msg": "Mandatory lockup period is still active"
    },
    {
      "code": 6017,
      "name": "metadataUriTooLong",
      "msg": "Metadata URI exceeds the maximum length"
    },
    {
      "code": 6018,
      "name": "tooManyJurisdictions",
      "msg": "Too many allowed jurisdictions supplied"
    },
    {
      "code": 6019,
      "name": "blockedListFull",
      "msg": "Blocked-user list is full"
    },
    {
      "code": 6020,
      "name": "invalidTransferHookProgram",
      "msg": "Provided transfer-hook program does not match the configured program id"
    },
    {
      "code": 6021,
      "name": "nothingToClaim",
      "msg": "Nothing available to claim"
    },
    {
      "code": 6022,
      "name": "invalidLockup",
      "msg": "Lockup period is too large"
    },
    {
      "code": 6023,
      "name": "roleCannotCreateListing",
      "msg": "This role cannot create listings (requires Artist or Both)"
    },
    {
      "code": 6024,
      "name": "offerNotActive",
      "msg": "Resale offer is not active"
    },
    {
      "code": 6025,
      "name": "offerExpired",
      "msg": "Resale offer has expired"
    },
    {
      "code": 6026,
      "name": "insufficientOfferShares",
      "msg": "Resale offer does not have that many shares remaining"
    },
    {
      "code": 6027,
      "name": "belowMinimumSaleValue",
      "msg": "Sale price is below the minimum sale value for this listing"
    },
    {
      "code": 6028,
      "name": "insufficientBalance",
      "msg": "Seller does not hold enough shares"
    },
    {
      "code": 6029,
      "name": "selfTrade",
      "msg": "Buyer and seller must be different accounts"
    },
    {
      "code": 6030,
      "name": "distributorNotAuthorized",
      "msg": "Distributor is not authorized for this listing"
    },
    {
      "code": 6031,
      "name": "distributorNameTooLong",
      "msg": "Distributor name exceeds the maximum length"
    },
    {
      "code": 6032,
      "name": "leaseNotExpired",
      "msg": "Listing's lease term has not expired yet"
    },
    {
      "code": 6033,
      "name": "leaseExpired",
      "msg": "Listing's lease term has expired"
    },
    {
      "code": 6034,
      "name": "listingTerminated",
      "msg": "Listing has been terminated"
    },
    {
      "code": 6035,
      "name": "invalidListingType",
      "msg": "This listing type does not support that operation"
    },
    {
      "code": 6036,
      "name": "unmediatedTransfer",
      "msg": "Share transfers must be mediated by the royalty-shares program"
    },
    {
      "code": 6037,
      "name": "invalidAuctionParams",
      "msg": "Auction parameters are invalid"
    },
    {
      "code": 6038,
      "name": "invalidLeaseDuration",
      "msg": "Lease duration is invalid"
    },
    {
      "code": 6039,
      "name": "usernameLength",
      "msg": "Username must be between 3 and 32 characters"
    },
    {
      "code": 6040,
      "name": "usernameInvalidCharacter",
      "msg": "Username may only contain lowercase letters, digits and underscores"
    },
    {
      "code": 6041,
      "name": "usernameAlreadyClaimed",
      "msg": "This profile already has a username; release it before claiming another"
    },
    {
      "code": 6042,
      "name": "usernameMismatch",
      "msg": "Username does not match the record being released"
    },
    {
      "code": 6043,
      "name": "invalidCommitmentScheme",
      "msg": "Unknown PII commitment scheme"
    },
    {
      "code": 6044,
      "name": "complianceBlocked",
      "msg": "Account is restricted or frozen by compliance"
    },
    {
      "code": 6045,
      "name": "transferNotFound",
      "msg": "No matching share transfer found in this transaction to back the trade record"
    }
  ],
  "types": [
    {
      "name": "complianceConfig",
      "docs": [
        "Per-listing compliance knobs. **PDA:** `[\"compliance\", share_mint]`.",
        "",
        "Deliberately seeded by `share_mint` (not `listing`) so the transfer hook — which only",
        "has the mint in hand during a transfer — can derive it. Written by the compliance",
        "authority (`block_user` / `unblock_user` / `update_compliance`)."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "listing",
            "docs": [
              "The listing this config governs. The hook reads the listing's address from here",
              "(via `PubkeyData`) to reach `total_shares` / jurisdictions / accreditation."
            ],
            "type": "pubkey"
          },
          {
            "name": "shareMint",
            "docs": [
              "The share mint; also the PDA seed. The hook asserts this matches the mint moving."
            ],
            "type": "pubkey"
          },
          {
            "name": "maxSharesPerWallet",
            "docs": [
              "Per-wallet share cap for this listing. `0` = unlimited."
            ],
            "type": "u64"
          },
          {
            "name": "blockedUsers",
            "docs": [
              "Sanctions/AML blocklist. Neither sender nor recipient may be on it.",
              "Bounded to keep the account size fixed and the scan cheap."
            ],
            "type": {
              "vec": "pubkey"
            }
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "complianceStatus",
      "docs": [
        "Transactional standing of a wallet. Deliberately **reason-free**.",
        "",
        "This replaced an earlier `is_sanctioned: bool`. Publishing \"this named person is",
        "sanctioned\" to an immutable public ledger is a defamation and GDPR exposure that",
        "outlives the designation itself — including when the designation was an error. The",
        "enforcement is identical; the *reason* now lives in the case file off-chain."
      ],
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "ok"
          },
          {
            "name": "restricted"
          },
          {
            "name": "frozen"
          }
        ]
      }
    },
    {
      "name": "complianceUpdated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "shareMint",
            "type": "pubkey"
          },
          {
            "name": "maxSharesPerWallet",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "createListingParams",
      "docs": [
        "Caller-supplied listing parameters. Immutable once the listing is created."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "songId",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "metadataUri",
            "type": "string"
          },
          {
            "name": "totalShares",
            "type": "u64"
          },
          {
            "name": "pricePerShare",
            "type": "u64"
          },
          {
            "name": "royaltyPercentSold",
            "type": "u16"
          },
          {
            "name": "artistRetainedPercent",
            "type": "u16"
          },
          {
            "name": "startTime",
            "type": "i64"
          },
          {
            "name": "endTime",
            "type": {
              "option": "i64"
            }
          },
          {
            "name": "lockupSeconds",
            "type": "u64"
          },
          {
            "name": "requiresAccredited",
            "type": "bool"
          },
          {
            "name": "allowedJurisdictions",
            "type": {
              "vec": {
                "array": [
                  "u8",
                  2
                ]
              }
            }
          },
          {
            "name": "maxSharesPerWallet",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "distributionRecord",
      "docs": [
        "An immutable record of a royalty distribution that the platform paid **off-chain**.",
        "**PDA:** `[\"distribution\", listing, index]`.",
        "",
        "The program moves no funds. This exists so the payout is on the public ledger and",
        "verifiable: `merkle_root` optionally commits to the exact per-holder payout list, so any",
        "holder can later prove they were paid the right amount without the list being published."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "listing",
            "type": "pubkey"
          },
          {
            "name": "index",
            "docs": [
              "Sequential index within the listing (the PDA seed)."
            ],
            "type": "u64"
          },
          {
            "name": "totalAmount",
            "docs": [
              "Total distributed in settlement-currency minor units."
            ],
            "type": "u64"
          },
          {
            "name": "merkleRoot",
            "docs": [
              "Commitment to the per-holder payout breakdown, or all-zero if none supplied."
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "timestamp",
            "type": "i64"
          },
          {
            "name": "reference",
            "docs": [
              "Off-chain payout-batch reference (e.g. a banking/ledger batch id)."
            ],
            "type": {
              "array": [
                "u8",
                64
              ]
            }
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "globalConfig",
      "docs": [
        "Singleton platform configuration. **PDA:** `[\"global_config\"]`.",
        "",
        "The single source of truth for platform-wide policy. Written once by",
        "`initialize_global` (upgrade-authority gated); only the two authority fields can",
        "mutate it thereafter."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "docs": [
              "Platform ops authority (multisig recommended). Controls the circuit breaker",
              "(`set_global_pause`) and listing status (`set_listing_status`)."
            ],
            "type": "pubkey"
          },
          {
            "name": "complianceAuthority",
            "docs": [
              "Compliance/risk authority. Sole writer of the KYC registry and per-listing",
              "blocklists/caps. Separated from `authority` so ops and legal are distinct keys."
            ],
            "type": "pubkey"
          },
          {
            "name": "treasury",
            "docs": [
              "Platform fee recipient. **Recorded policy only** — this program moves no money, so",
              "the fee is charged and settled off-chain by the API. Kept on-chain for transparency."
            ],
            "type": "pubkey"
          },
          {
            "name": "sbstMint",
            "docs": [
              "The settlement currency (SBST) all listing prices are quoted in. **Reference only**:",
              "no SBST is ever moved on-chain — payment happens off-chain and is recorded as data",
              "on each [`TradeRecord`]. See `docs/architecture.md`."
            ],
            "type": "pubkey"
          },
          {
            "name": "platformFeeBps",
            "docs": [
              "Platform fee on primary sales, in basis points (e.g. `200` = 2%). Recorded policy;",
              "enforced by the API when it settles payment, not by this program."
            ],
            "type": "u16"
          },
          {
            "name": "maxGlobalOwnershipBps",
            "docs": [
              "Max fraction of a listing's supply one wallet may hold, in basis points",
              "(e.g. `499` = 4.99%). Enforced on both primary buys and secondary transfers.",
              "NOTE: per-wallet, not per-investor — see docs/security.md (per-wallet caps)."
            ],
            "type": "u16"
          },
          {
            "name": "isPaused",
            "docs": [
              "Global emergency pause. When true, `buy_shares` and all secondary transfers (via the",
              "hook) are halted."
            ],
            "type": "bool"
          },
          {
            "name": "bump",
            "docs": [
              "Canonical PDA bump, stored so later instructions validate without re-deriving."
            ],
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "globalPauseChanged",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "paused",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "holderPosition",
      "docs": [
        "Per-holder lockup record for a listing. **PDA:** `[\"position\", share_mint, owner]`.",
        "",
        "Created on a primary buy and read by the transfer hook to enforce the mandatory hold.",
        "It no longer tracks share balances or royalty entitlement: the SPL token account is the",
        "authority on holdings, and royalties are computed off-chain from live balances at",
        "distribution time (which is what retires the old AUDIT F1/F7 caveats — there is no vault",
        "and no primary-vs-live divergence to be unfair about)."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "docs": [
              "Position owner; pinned on first init and used as a PDA seed."
            ],
            "type": "pubkey"
          },
          {
            "name": "shareMint",
            "type": "pubkey"
          },
          {
            "name": "unlockTime",
            "docs": [
              "`now + listing.lockup_seconds` at the last purchase; the hook blocks sends before it."
            ],
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "identityRegistered",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "user",
            "type": "pubkey"
          },
          {
            "name": "kycLevel",
            "type": "u8"
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "complianceStatus"
              }
            }
          },
          {
            "name": "piiVersion",
            "type": "u16"
          }
        ]
      }
    },
    {
      "name": "identityRegistry",
      "docs": [
        "Per-user KYC / AML record. **PDA:** `[\"identity\", user]`.",
        "",
        "Written only by the compliance authority (`register_identity` / `set_pii_commitment`).",
        "The transfer hook reads this for both the sender and recipient on every secondary",
        "transfer, and `buy_shares` reads the buyer's.",
        "",
        "**Privacy:** everything here is world-readable forever. The only personal data present",
        "is the 2-byte jurisdiction (which the transfer hook genuinely needs) and a salted hash",
        "of the rest. See `docs/architecture.md`."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "user",
            "docs": [
              "The wallet this record describes. Pinned on first init; also the PDA seed."
            ],
            "type": "pubkey"
          },
          {
            "name": "kycLevel",
            "docs": [
              "0 = None, 1 = Basic, 2 = Accredited, 3 = Institutional. A holder needs ≥ 1."
            ],
            "type": "u8"
          },
          {
            "name": "jurisdiction",
            "docs": [
              "ISO 3166-1 alpha-2 country code as raw bytes (e.g. `[b'G', b'B']`)."
            ],
            "type": {
              "array": [
                "u8",
                2
              ]
            }
          },
          {
            "name": "status",
            "docs": [
              "Transactional standing. Gates buys and both sides of every transfer."
            ],
            "type": {
              "defined": {
                "name": "complianceStatus"
              }
            }
          },
          {
            "name": "accredited",
            "docs": [
              "Accredited-investor status; required by listings with `requires_accredited`."
            ],
            "type": "bool"
          },
          {
            "name": "piiCommitment",
            "docs": [
              "Commitment to the user's off-chain PII: `sha256(salt || canonical_json(pii))`.",
              "",
              "The salt is 32 random bytes held (encrypted) in the backend database — **without it",
              "this hash is brute-forceable**, since a name/DOB/postcode tuple carries only ~30",
              "bits of real entropy. Zeroed until the first KYC submission.",
              "",
              "Deleting the salt renders this unlinkable, which is our right-to-erasure mechanism."
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "piiVersion",
            "docs": [
              "Bumped on every change to `pii_commitment`, giving a countable re-verification",
              "history. Must be mirrored in the database so drift is detectable."
            ],
            "type": "u16"
          },
          {
            "name": "commitmentScheme",
            "docs": [
              "Which scheme produced `pii_commitment` (see `COMMITMENT_SHA256_SALTED`). Recorded so",
              "that old records stay verifiable after the scheme is rotated."
            ],
            "type": "u8"
          },
          {
            "name": "lastVerified",
            "docs": [
              "Unix time of the last compliance refresh (informational / for off-chain expiry)."
            ],
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "initializeGlobalParams",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "complianceAuthority",
            "type": "pubkey"
          },
          {
            "name": "treasury",
            "type": "pubkey"
          },
          {
            "name": "sbstMint",
            "type": "pubkey"
          },
          {
            "name": "platformFeeBps",
            "type": "u16"
          },
          {
            "name": "maxGlobalOwnershipBps",
            "type": "u16"
          }
        ]
      }
    },
    {
      "name": "listingCreated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "listing",
            "type": "pubkey"
          },
          {
            "name": "artist",
            "type": "pubkey"
          },
          {
            "name": "totalShares",
            "type": "u64"
          },
          {
            "name": "pricePerShare",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "listingStatus",
      "docs": [
        "Lifecycle state of a listing. `buy_shares` only proceeds while `Active`."
      ],
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "pending"
          },
          {
            "name": "active"
          },
          {
            "name": "soldOut"
          },
          {
            "name": "paused"
          },
          {
            "name": "closed"
          }
        ]
      }
    },
    {
      "name": "listingStatusChanged",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "listing",
            "type": "pubkey"
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "listingStatus"
              }
            }
          }
        ]
      }
    },
    {
      "name": "piiCommitmentUpdated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "user",
            "type": "pubkey"
          },
          {
            "name": "piiVersion",
            "type": "u16"
          }
        ]
      }
    },
    {
      "name": "platformFeeUpdated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "platformFeeBps",
            "type": "u16"
          }
        ]
      }
    },
    {
      "name": "registerIdentityParams",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "kycLevel",
            "type": "u8"
          },
          {
            "name": "jurisdiction",
            "type": {
              "array": [
                "u8",
                2
              ]
            }
          },
          {
            "name": "status",
            "docs": [
              "Transactional standing. Reason-free by design — see [`ComplianceStatus`]."
            ],
            "type": {
              "defined": {
                "name": "complianceStatus"
              }
            }
          },
          {
            "name": "accredited",
            "type": "bool"
          },
          {
            "name": "piiCommitment",
            "docs": [
              "`sha256(salt || canonical_json(pii))`, or `None` to leave the existing commitment",
              "untouched (e.g. a status change that doesn't re-verify the underlying documents)."
            ],
            "type": {
              "option": {
                "array": [
                  "u8",
                  32
                ]
              }
            }
          }
        ]
      }
    },
    {
      "name": "royaltyDistributed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "listing",
            "type": "pubkey"
          },
          {
            "name": "index",
            "type": "u64"
          },
          {
            "name": "totalAmount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "secondaryTradeRecorded",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "listing",
            "type": "pubkey"
          },
          {
            "name": "seller",
            "type": "pubkey"
          },
          {
            "name": "buyer",
            "type": "pubkey"
          },
          {
            "name": "shares",
            "type": "u64"
          },
          {
            "name": "settlementAmount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "sharesPurchased",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "listing",
            "type": "pubkey"
          },
          {
            "name": "buyer",
            "type": "pubkey"
          },
          {
            "name": "shares",
            "type": "u64"
          },
          {
            "name": "settlementAmount",
            "docs": [
              "Amount settled off-chain, recorded as data."
            ],
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "songListing",
      "docs": [
        "A song \"card\": a fixed supply of fractional royalty shares.",
        "**PDA:** `[\"listing\", artist, song_id]`.",
        "",
        "Immutable-after-init fields (`artist`, `song_id`, `share_mint`, `total_shares`) are",
        "what make the self-referential PDA seeds safe to trust elsewhere."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "artist",
            "docs": [
              "Creator of the listing; also the recipient of primary-sale proceeds and a PDA seed."
            ],
            "type": "pubkey"
          },
          {
            "name": "songId",
            "docs": [
              "Stable unique id for the song (e.g. an ISRC or content hash). PDA seed."
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "metadataUri",
            "docs": [
              "Off-chain JSON (song details, perks, legal). The mint's MetadataPointer points at",
              "this listing account, which anchors this URI on-chain."
            ],
            "type": "string"
          },
          {
            "name": "totalShares",
            "docs": [
              "Fixed total supply of shares. `shares_minted` can never exceed this."
            ],
            "type": "u64"
          },
          {
            "name": "sharesMinted",
            "docs": [
              "Shares issued so far via primary sales. Monotonic up to `total_shares`."
            ],
            "type": "u64"
          },
          {
            "name": "pricePerShare",
            "docs": [
              "Primary price per share, in SBST base units."
            ],
            "type": "u64"
          },
          {
            "name": "royaltyPercentSold",
            "docs": [
              "Share of streaming royalties being sold, in basis points (informational on-chain)."
            ],
            "type": "u16"
          },
          {
            "name": "artistRetainedPercent",
            "docs": [
              "Share the artist keeps, in basis points. `royalty_percent_sold + this ≤ 10_000`."
            ],
            "type": "u16"
          },
          {
            "name": "startTime",
            "docs": [
              "Primary sale opens at this Unix time."
            ],
            "type": "i64"
          },
          {
            "name": "endTime",
            "docs": [
              "Optional primary sale close time (`None` = no end)."
            ],
            "type": {
              "option": "i64"
            }
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "listingStatus"
              }
            }
          },
          {
            "name": "shareMint",
            "docs": [
              "The Token-2022 share mint (a PDA of this program; mint authority = this listing)."
            ],
            "type": "pubkey"
          },
          {
            "name": "lockupSeconds",
            "docs": [
              "Mandatory hold after purchase; sets `HolderPosition.unlock_time = now + this`."
            ],
            "type": "u64"
          },
          {
            "name": "requiresAccredited",
            "docs": [
              "If true, holders must be `accredited` (checked on buy and on secondary receipt)."
            ],
            "type": "bool"
          },
          {
            "name": "allowedJurisdictions",
            "docs": [
              "Whitelist of allowed holder jurisdictions. **Empty = all allowed.**"
            ],
            "type": {
              "vec": {
                "array": [
                  "u8",
                  2
                ]
              }
            }
          },
          {
            "name": "cumulativeRoyalties",
            "docs": [
              "Total royalties **recorded as distributed** off-chain, in settlement-currency minor",
              "units. Sum of every [`DistributionRecord.total_amount`]; monotonic. Audit figure —",
              "no funds back it on-chain."
            ],
            "type": "u64"
          },
          {
            "name": "totalDistributions",
            "docs": [
              "Distribution events recorded. Monotonic; doubles as the index seeding each",
              "[`DistributionRecord`] PDA."
            ],
            "type": "u64"
          },
          {
            "name": "totalTrades",
            "docs": [
              "Total trades recorded for this listing. Monotonic, and doubles as the index that seeds",
              "each `TradeRecord` PDA (guaranteeing uniqueness)."
            ],
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "tradeRecord",
      "docs": [
        "Immutable audit record, one per primary purchase.",
        "**PDA:** `[\"trade\", listing, trade_index]` where `trade_index` is the listing's",
        "`trade_count` at the time of purchase."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "listing",
            "type": "pubkey"
          },
          {
            "name": "from",
            "docs": [
              "Source of the shares. For a primary sale this is the artist/listing."
            ],
            "type": "pubkey"
          },
          {
            "name": "to",
            "docs": [
              "Buyer."
            ],
            "type": "pubkey"
          },
          {
            "name": "sharesAmount",
            "type": "u64"
          },
          {
            "name": "settlementAmount",
            "docs": [
              "Amount settled **off-chain** for this trade, in settlement-currency minor units",
              "(gross, incl. any platform fee). Recorded from the API — this program moves no money."
            ],
            "type": "u64"
          },
          {
            "name": "paymentTxHash",
            "docs": [
              "Caller-supplied off-chain/off-ramp payment reference — NOT the on-chain signature",
              "(a program cannot read its own tx hash at runtime)."
            ],
            "type": {
              "array": [
                "u8",
                64
              ]
            }
          },
          {
            "name": "timestamp",
            "type": "i64"
          },
          {
            "name": "tradeType",
            "type": {
              "defined": {
                "name": "tradeType"
              }
            }
          },
          {
            "name": "complianceApproved",
            "docs": [
              "Always true for records this program writes (the sale passed every check first);",
              "kept for a uniform off-chain audit schema."
            ],
            "type": "bool"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "tradeType",
      "docs": [
        "Whether a trade was a primary issuance or a secondary market move."
      ],
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "primary"
          },
          {
            "name": "secondary"
          }
        ]
      }
    },
    {
      "name": "userBlocked",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "shareMint",
            "type": "pubkey"
          },
          {
            "name": "user",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "userProfile",
      "docs": [
        "Per-user platform profile. **PDA:** `[\"user_profile\", user]`.",
        "",
        "Created at signup (the custodial backend can do this on the user's behalf) and separate from",
        "[`IdentityRegistry`], which is the compliance-authority-owned KYC record.",
        "",
        "**Privacy:** on-chain data is world-readable — this holds role, a public handle and",
        "counters only. Never put PII here; personal data lives in the backend and is committed",
        "to on-chain as a salted hash on [`IdentityRegistry`]."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "user",
            "docs": [
              "The wallet this profile belongs to; also the PDA seed."
            ],
            "type": "pubkey"
          },
          {
            "name": "username",
            "docs": [
              "Public handle, or empty if none claimed. **Public by design**, and therefore a",
              "deliberate re-identification vector: a username tied to an address exposes that",
              "user's entire trading history to anyone. Claiming one must be opt-in, and trading",
              "with no username claimed must stay possible.",
              "",
              "The authoritative uniqueness record is the [`UsernameRecord`] PDA; this is the",
              "convenience copy so a profile read doesn't need a second lookup."
            ],
            "type": "string"
          },
          {
            "name": "role",
            "docs": [
              "Artist / Investor / Both — gates listing creation."
            ],
            "type": {
              "defined": {
                "name": "userRole"
              }
            }
          },
          {
            "name": "createdAt",
            "docs": [
              "Unix time the profile was created."
            ],
            "type": "i64"
          },
          {
            "name": "listingsCreated",
            "docs": [
              "Listings this user has created (as an artist)."
            ],
            "type": "u64"
          },
          {
            "name": "tradesCount",
            "docs": [
              "Primary purchases this user has made. Full history comes from indexing `TradeRecord`",
              "by `from`/`to` — an on-chain list would grow unbounded."
            ],
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "userProfileCreated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "user",
            "type": "pubkey"
          },
          {
            "name": "role",
            "type": {
              "defined": {
                "name": "userRole"
              }
            }
          }
        ]
      }
    },
    {
      "name": "userRole",
      "docs": [
        "What a wallet is allowed to do on the platform. Checked when creating listings."
      ],
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "investor"
          },
          {
            "name": "artist"
          },
          {
            "name": "both"
          }
        ]
      }
    },
    {
      "name": "userRoleUpdated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "user",
            "type": "pubkey"
          },
          {
            "name": "role",
            "type": {
              "defined": {
                "name": "userRole"
              }
            }
          }
        ]
      }
    },
    {
      "name": "userUnblocked",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "shareMint",
            "type": "pubkey"
          },
          {
            "name": "user",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "usernameClaimed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "user",
            "type": "pubkey"
          },
          {
            "name": "username",
            "type": "string"
          }
        ]
      }
    },
    {
      "name": "usernameRecord",
      "docs": [
        "A claimed username. **PDA:** `[\"username\", username_bytes]`.",
        "",
        "This account exists purely so the **runtime** enforces uniqueness: `init` on an address",
        "that already holds an account fails atomically, so two concurrent claims for the same",
        "name cannot both succeed. That removes the need for a reservation table and the",
        "check-then-write race that comes with one.",
        "",
        "Seeding on the raw name rather than a hash is safe only because the charset is",
        "restricted to `[a-z0-9_]` — one name has exactly one byte representation, so",
        "`Josh` / `josh` / `jоsh` (Cyrillic `о`) cannot resolve to different accounts that look",
        "identical to a human. See `claim_username` for the validation."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "docs": [
              "The wallet that owns this name. Only this wallet may release it."
            ],
            "type": "pubkey"
          },
          {
            "name": "claimedAt",
            "docs": [
              "Unix time of the claim, so disputes over who had a name first are resolvable."
            ],
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "usernameReleased",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "user",
            "type": "pubkey"
          },
          {
            "name": "username",
            "type": "string"
          }
        ]
      }
    }
  ],
  "constants": [
    {
      "name": "bpsDenominator",
      "docs": [
        "Basis-point denominator (100% = 10_000 bps)."
      ],
      "type": "u64",
      "value": "10000"
    },
    {
      "name": "complianceSeed",
      "type": "bytes",
      "value": "[99, 111, 109, 112, 108, 105, 97, 110, 99, 101]"
    },
    {
      "name": "distributionSeed",
      "docs": [
        "Royalty distribution event (recorded; the payout itself happens off-chain)."
      ],
      "type": "bytes",
      "value": "[100, 105, 115, 116, 114, 105, 98, 117, 116, 105, 111, 110]"
    },
    {
      "name": "distributorSeed",
      "type": "bytes",
      "value": "[100, 105, 115, 116, 114, 105, 98, 117, 116, 111, 114]"
    },
    {
      "name": "globalConfigSeed",
      "type": "bytes",
      "value": "[103, 108, 111, 98, 97, 108, 95, 99, 111, 110, 102, 105, 103]"
    },
    {
      "name": "identitySeed",
      "type": "bytes",
      "value": "[105, 100, 101, 110, 116, 105, 116, 121]"
    },
    {
      "name": "listingSeed",
      "type": "bytes",
      "value": "[108, 105, 115, 116, 105, 110, 103]"
    },
    {
      "name": "positionSeed",
      "type": "bytes",
      "value": "[112, 111, 115, 105, 116, 105, 111, 110]"
    },
    {
      "name": "resaleSeed",
      "type": "bytes",
      "value": "[114, 101, 115, 97, 108, 101]"
    },
    {
      "name": "shareDecimals",
      "docs": [
        "Fractional royalty shares are indivisible -> the Token-2022 share mint uses 0 decimals."
      ],
      "type": "u8",
      "value": "0"
    },
    {
      "name": "shareMintSeed",
      "type": "bytes",
      "value": "[115, 104, 97, 114, 101, 95, 109, 105, 110, 116]"
    },
    {
      "name": "tradeSeed",
      "type": "bytes",
      "value": "[116, 114, 97, 100, 101]"
    },
    {
      "name": "usernameSeed",
      "docs": [
        "Username claim. Seeded by the **raw** username bytes — safe because the charset is",
        "restricted to `[a-z0-9_]` (see `MAX_USERNAME_LEN`), so a name has exactly one byte",
        "representation and cannot collide by case or homoglyph."
      ],
      "type": "bytes",
      "value": "[117, 115, 101, 114, 110, 97, 109, 101]"
    },
    {
      "name": "userProfileSeed",
      "type": "bytes",
      "value": "[117, 115, 101, 114, 95, 112, 114, 111, 102, 105, 108, 101]"
    }
  ]
};
