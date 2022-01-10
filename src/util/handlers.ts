import { REST } from '@discordjs/rest'
import { Routes } from 'discord-api-types/v9'
import {
  Client,
  Collection,
  GuildMember,
  Interaction,
  Message,
  MessageEmbed,
  PermissionString,
} from 'discord.js'
import { readdirSync } from 'fs'
import db from 'quick.db'

import { CommandProps } from './commands'
import { BotEvent } from './events'

const commands = './build/commands'
const events = './build/events'

let commandsMap = new Collection<string, CommandProps>()
let categoryMap = new Collection<string, string[]>()
let slashCommandsCache = new Collection<string, any[]>()
let globalPrefix = process.env.PREFIX as string

export function checkPermissions(member: GuildMember, perms: PermissionString[]) {
  return perms.some((perm) => member.permissions.has(perm))
}

export function formatPermissionDiff(reqPerms: PermissionString[], perms: PermissionString[]) {
  let permsDiff = perms.filter((x) => !reqPerms.includes(x))
  return `\`${permsDiff.join('`, `')}\``.replace('_', ' ')
}

export async function handleMessageCommand(client: Client, message: Message) {
  let rawContent = message.content

  if (message.author.bot) return
  if (!message.guild) return
  if (!rawContent.startsWith(globalPrefix)) return

  let commandContent = rawContent.slice(globalPrefix.length, rawContent.length)
  let args = commandContent.split(/ +/g)

  let command = (args.shift() as string).trim()

  let commandProps = commandsMap.get(command)

  if (!commandProps) return

  let cooldownKey = `${message.author.id}.cooldowns.${commandProps.name}`

  let cooldownTimestamp: number | undefined = db.get(cooldownKey)

  if (cooldownTimestamp) {
    let currentTimestamp = Date.now()

    if (currentTimestamp > cooldownTimestamp) {
      if (commandProps.permissions?.member) {
        if (!checkPermissions(message.member as GuildMember, commandProps.permissions.member)) {
          throw new Error(
            `You are missing the following permissions to perform this command. \n${formatPermissionDiff(
              message.member?.permissions.toArray() as PermissionString[],
              commandProps.permissions.member
            )}`
          )
        }
      }

      if (commandProps.permissions?.bot) {
        if (!checkPermissions(message.guild.me as GuildMember, commandProps.permissions.bot)) {
          throw new Error(
            `I am missing the following permissions to perform this command. \n${formatPermissionDiff(
              message.guild.me?.permissions.toArray() as PermissionString[],
              commandProps.permissions.bot
            )}`
          )
        }
      }

      commandProps
        .run(client, message, args)
        .catch((e) => message.reply({ embeds: [commandError(e)] }))
        // Set it to the time when the cooldown expires
        .then(() =>
          db.set(cooldownKey, Date.now() + (commandProps as CommandProps).cooldown * 1000)
        )
    } else if (currentTimestamp <= cooldownTimestamp) {
      let timeRemaining = cooldownTimestamp - currentTimestamp

      const embed = new MessageEmbed()
        .setColor('GREYPLE')
        .setTitle('⏳ Cooldown')
        .setDescription(
          `You still need to wait \`${
            timeRemaining / 1000
          }\` seconds before you can use this command again.`
        )

      message.reply({ embeds: [embed] })
    }
  } else {
    if (commandProps.permissions?.member) {
      if (!checkPermissions(message.member as GuildMember, commandProps.permissions.member)) {
        throw new Error(
          `You are missing the following permissions to perform this command. \n${formatPermissionDiff(
            message.member?.permissions.toArray() as PermissionString[],
            commandProps.permissions.member
          )}`
        )
      }
    }

    if (commandProps.permissions?.bot) {
      if (!checkPermissions(message.guild.me as GuildMember, commandProps.permissions.bot)) {
        throw new Error(
          `I am missing the following permissions to perform this command. \n${formatPermissionDiff(
            message.guild.me?.permissions.toArray() as PermissionString[],
            commandProps.permissions.bot
          )}`
        )
      }
    }

    commandProps
      .run(client, message, args)
      .catch((e) => message.reply({ embeds: [commandError(e)] }))
      // Set it to the time when the cooldown expires
      .then(() => db.set(cooldownKey, Date.now() + (commandProps as CommandProps).cooldown * 1000))
  }
}

export async function handleSlashCommand(client: Client, interaction: Interaction) {
  if (!interaction.isCommand()) return
  if (!interaction.inGuild()) return

  let commandName = interaction.commandName
  let commandProps = commandsMap.get(commandName)

  if (!commandProps) return console.error(`Could not find slash command ${commandName}`)

  let cooldownKey = `${interaction.user.id}.cooldowns.${commandProps.name}`

  let cooldownTimestamp: number | undefined = db.get(cooldownKey)

  if (cooldownTimestamp) {
    let currentTimestamp = Date.now()

    if (currentTimestamp > cooldownTimestamp) {
      if (commandProps.permissions?.member) {
        if (!checkPermissions(interaction.member as GuildMember, commandProps.permissions.member)) {
          throw new Error(
            `You are missing the following permissions to perform this command. \n${formatPermissionDiff(
              interaction.memberPermissions?.toArray() as PermissionString[],
              commandProps.permissions.member
            )}`
          )
        }
      }

      if (commandProps.permissions?.bot) {
        if (!checkPermissions(interaction.guild?.me as GuildMember, commandProps.permissions.bot)) {
          throw new Error(
            `I am missing the following permissions to perform this command. \n${formatPermissionDiff(
              interaction.guild?.me?.permissions.toArray() as PermissionString[],
              commandProps.permissions.bot
            )}`
          )
        }
      }

      commandProps.interaction(client, interaction)

      // Set it to the time when the cooldown expires
      db.set(cooldownKey, Date.now() + commandProps.cooldown * 1000)
    } else if (currentTimestamp <= cooldownTimestamp) {
      let timeRemaining = cooldownTimestamp - currentTimestamp

      const embed = new MessageEmbed()
        .setColor('GREYPLE')
        .setTitle('⏳ Cooldown')
        .setDescription(
          `You still need to wait \`${
            timeRemaining / 1000
          }\` seconds before you can use this command again.`
        )

      interaction.reply({ embeds: [embed] })
    }
  } else {
    if (commandProps.permissions?.member) {
      if (!checkPermissions(interaction.member as GuildMember, commandProps.permissions.member)) {
        throw new Error(
          `You are missing the following permissions to perform this command. \n${formatPermissionDiff(
            interaction.memberPermissions?.toArray() as PermissionString[],
            commandProps.permissions.member
          )}`
        )
      }
    }

    if (commandProps.permissions?.bot) {
      if (!checkPermissions(interaction.guild?.me as GuildMember, commandProps.permissions.bot)) {
        throw new Error(
          `I am missing the following permissions to perform this command. \n${formatPermissionDiff(
            interaction.guild?.me?.permissions.toArray() as PermissionString[],
            commandProps.permissions.bot
          )}`
        )
      }
    }
    commandProps.interaction(client, interaction)

    // Set it to the time when the cooldown expires
    db.set(cooldownKey, Date.now() + commandProps.cooldown * 1000)
  }
}

export function loadCommands(subDir?: string) {
  if (!slashCommandsCache.get('body')) {
    slashCommandsCache.set('body', [])
  }
  readdirSync(`${commands}${subDir ? `/${subDir}` : ''}`).forEach(async (file) => {
    if (file.endsWith('.js')) {
      console.info(`💬 Loading message command from ${file}`)
      let commandFile = await import(`../commands${subDir ? `/${subDir}` : ''}/${file}`)
      let commandProps: CommandProps = commandFile.default

      // Combine aliases and the name into 1 array with all the triggers in it
      let triggers = [...[commandProps.name], ...(commandProps.aliases || [])]

      triggers.forEach((trigger) => {
        commandsMap.set(trigger, commandProps)
      })

      let slashCommandsBody = slashCommandsCache.get('body') as any[]

      slashCommandsBody.push(commandProps.slashCommand.toJSON())
      slashCommandsCache.set('body', slashCommandsBody)
      if (!commandProps.hidden) {
        let categoryId = commandProps.category
          .replace(/[^\p{L}\p{N}\p{P}\p{Z}^$\n]/gu, '')
          .toLowerCase()
          .trim()

        let cat = categoryMap.get(categoryId)

        if (!cat) {
          categoryMap.set(categoryId, [])
        }
        let catArray = categoryMap.get(categoryId) as string[]

        catArray.push(commandProps.name)

        categoryMap.set(categoryId, catArray)
      }
    } else if (!file.endsWith('.js') && file.indexOf('.') == -1) {
      loadCommands(file)
    }
  })
}

export async function registerSlashCommands() {
  const rest = new REST({ version: '9' }).setToken(process.env.TOKEN as string)

  try {
    console.info('Registering slash commands..')
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID as string), {
      body: slashCommandsCache.get('body') as any[],
    })
  } catch (e) {
    console.error(e)
  }
}

export function loadEvents(client: Client, subDir?: string) {
  readdirSync(`${events}${subDir ? `/${subDir}` : ''}`).forEach(async (file) => {
    if (file.endsWith('.js')) {
      console.info(`🔔 Loading event from ${file}`)
      let eventFile = await import(`../events${subDir ? `/${subDir}` : ''}/${file}`)
      let eventProps: BotEvent<any> = eventFile.default

      console.info(`🔔 Loaded event -> ${eventProps.event}`)

      client.on(eventProps.event, (...args) => eventProps.run(client, ...args))
    } else if (!file.endsWith('.js') && file.indexOf('.') == -1) {
      loadEvents(client, file)
    }
  })
}

export function categoryExist(cat: string) {
  return categoryMap.get(cat) ? true : false
}

export function commandExist(cmd: string) {
  return commandsMap.get(cmd) ? true : false
}

export function helpForCategory(catStr: string) {
  let cat = catStr.toLowerCase()
  let exist = categoryExist(cat)

  let formattedString = ''

  if (exist) {
    let commandNames = categoryMap.get(cat) as string[]

    formattedString = `\`${commandNames.join('` `')}\``

    const embed = new MessageEmbed()
      .setColor('BLURPLE')
      .setTitle(`Help for ${cat}`)
      .setDescription(
        `Use \`${globalPrefix}help <command>\` to find help for a command.\n\n**Commands:**\n${formattedString}`
      )

    return embed
  } else if (commandExist(cat)) {
    let commandProps = commandsMap.get(cat)

    if (commandProps?.hidden) {
      const embed = new MessageEmbed()
        .setColor('RED')
        .setTitle('Error')
        .setDescription('Category/Command not found.')

      return embed
    }

    const embed = new MessageEmbed()
      .setColor('GREEN')
      .setTitle(`Help for command: ${cat}`)
      .setDescription(
        `**Cooldown:** \`${commandProps?.cooldown}\` seconds\n**Description:** ${
          commandProps?.description
        }\n**Category:** ${commandProps?.category}\n**Usage:** \`${`${
          commandProps?.commandPreference == 'slash' ? '/' : globalPrefix
        }${commandProps?.name} ${commandProps?.usage.trim()}`.trim()}\`\n**Aliases:** ${
          commandProps?.aliases ? commandProps?.aliases?.join(' ') : 'None'
        }`
      )

    return embed
  } else {
    const embed = new MessageEmbed()
      .setColor('RED')
      .setTitle('Error')
      .setDescription('Category/Command not found.')

    return embed
  }
}

function capitalizeFirstLetter(string: string) {
  return string.charAt(0).toUpperCase() + string.slice(1)
}

export function helpMain() {
  const embed = new MessageEmbed()
    .setColor('BLURPLE')
    .setTitle('Help')
    .setDescription(
      `Use \`${globalPrefix}help <command/category>\` to find help of a command/category`
    )

  categoryMap.forEach((val, key) => {
    let preview = `\`${val.join('` `')}\``

    embed.addField(capitalizeFirstLetter(key), preview)
  })

  return embed
}

export function commandError(e: string) {
  const embed = new MessageEmbed().setColor('RED').setTitle('Error').setDescription(e.toString())

  return embed
}
