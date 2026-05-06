use anchor_lang::prelude::*;

declare_id!("jwE73RVS7HafaL4qAwEAnwxU3YFpWeddhaHqRekUwpa");

#[program]
pub mod prova_registry {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        msg!("Greetings from: {:?}", ctx.program_id);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
