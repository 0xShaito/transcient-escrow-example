mod types;
 
contract TranscientEscrow {
    use dep::aztec::context::Context;
    use dep::aztec::state_vars::{
        public_state::PublicState,
        map::Map,
        set::Set,
        singleton::Singleton,
        immutable_singleton::ImmutableSingleton
    };

    use crate::types::token_interface::{
        TokenPrivateContextInterface, 
        OwnerSettleEscrowStruct,
        RecipientSettleEscrowStruct,
        FromEscrowStruct,
        OwnerEscrowStruct,
        AccountBroadcastEscrowNoteForStruct,
        OwnerBroadcastEscrowNoteForStruct
    };

    use dep::aztec::types::address::AztecAddress;

    struct Storage {
    }

    impl Storage {
        fn init(context: Context) -> Self {
            Storage {
            }
        }
    }
 
    // Constructs the contract.
    #[aztec(private)]
    fn constructor() {}

    #[aztec(private)]
    fn createEscrows(token: AztecAddress, amount1: Field, nonce1: Field, amount2: Field, nonce2: Field) {
        let tokenContract = TokenPrivateContextInterface::at(token.address);

        // Create escrow 1
      let randomness1 = tokenContract.escrow(
                &mut context,
                FromEscrowStruct { address: context.msg_sender() },
                OwnerEscrowStruct { address: context.this_address() },
                amount1,
                nonce1
        )[0];

        // Broadcast escrow 1 to sender
        let _ = tokenContract.broadcast_escrow_note_for(
            &mut context,
            AccountBroadcastEscrowNoteForStruct { address: context.msg_sender() },
            OwnerBroadcastEscrowNoteForStruct { address: context.this_address() },
            amount1,
            randomness1
        );

        // Create escrow 2
        let randomness2 = tokenContract.escrow(
                &mut context,
                FromEscrowStruct { address: context.msg_sender() },
                OwnerEscrowStruct { address: context.this_address() },
                amount2,
                nonce2
        )[0];
        
        // Broadcast escrow 2 to sender
        let _ = tokenContract.broadcast_escrow_note_for(
            &mut context,
            AccountBroadcastEscrowNoteForStruct { address: context.msg_sender() },
            OwnerBroadcastEscrowNoteForStruct { address: context.this_address() },
            amount2,
            randomness2
        );
    }

    #[aztec(private)]
    fn combineTwoEscrows(token: AztecAddress, amount1: Field, randomness1: Field, amount2: Field, randomness2: Field) {
        // Settle escrow 1 send tokens to this contract
        let _ = TokenPrivateContextInterface::at(token.address).settle_escrow(
            &mut context,
            OwnerSettleEscrowStruct { address: context.this_address() },
            RecipientSettleEscrowStruct { address: context.this_address() },
            amount1,
            randomness1,
            0
        );

        // Settle escrow 2 send tokens to this contract
        let _ = TokenPrivateContextInterface::at(token.address).settle_escrow(
            &mut context,
            OwnerSettleEscrowStruct { address: context.this_address() },
            RecipientSettleEscrowStruct { address: context.this_address() },
            amount2,
            randomness2,
            0
        );

        // Create a new escrow with the sum of both amounts and put the sender as the owner
        let _ = TokenPrivateContextInterface::at(token.address).escrow(
            &mut context,
            FromEscrowStruct { address: context.this_address() },
            OwnerEscrowStruct { address: context.msg_sender() },
            amount1 + amount2,
            0
        );
    }


    // Computes note hash and nullifier.
    unconstrained fn compute_note_hash_and_nullifier(contract_address: Field, nonce: Field, storage_slot: Field, preimage: [Field; 0]) -> [Field; 1] {
        [0]
    }
}