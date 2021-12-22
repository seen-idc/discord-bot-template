import { SlashCommandBuilder } from '@discordjs/builders'
import { Client, Interaction, Message, PermissionString } from 'discord.js'

export interface CommandProps {
  name: string
  description: string
  usage: string
  cooldown: number
  hidden?: boolean
  commandPreference: 'slash' | 'message'
  permissions?: {
    member?: PermissionString[]
    bot?: PermissionString[]
  }
  aliases?: string[]
  category: string

  run: CommandFunction
  slashCommand: SlashCommandBuilder
  interaction: CommandInteraction
}

export type CommandFunction = (client: Client, message: Message, args: string[]) => Promise<any>
export type CommandInteraction = (client: Client, interaction: Interaction) => Promise<any>

export function defCommand(props: CommandProps): CommandProps {
  return props
}

export async function disabled(client: Client, message: Message, args: string[]) {
  return
}

export async function deprecated(client: Client, message: Message, args: string[]) {
  message.reply('This command is deprecated.')
}

export async function interactionDisabled(client: Client, interaction: Interaction) {
  return
}

export async function interactionDeprecated(client: Client, interaction: Interaction) {
  if (!interaction.isCommand()) return

  interaction.reply('This command is deprecated.')
}

export function commandDeprecated(
  type: 'slash' | 'message',
  altCommands?: string
): CommandFunction | CommandInteraction {
  if (type == 'slash') {
    return async function interactionDeprecated(client: Client, interaction: Interaction) {
      if (!interaction.isCommand()) return

      interaction.reply(
        `This command is deprecated. ${altCommands ? `\`Use ${altCommands}\`` : ''}`
      )
    }
  } else {
    return async function deprecated(client: Client, message: Message, args: string[]) {
      message.reply(`This command is deprecated. ${altCommands ? `\`Use ${altCommands}\`` : ''}`)
    }
  }
}
