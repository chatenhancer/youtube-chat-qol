import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createChatCommands } from './index';
import { DEFAULT_OPTIONS } from '../../../shared/options';
import type { ChatCommandDefinition, ChatCommandRuntime, InlineParsedCommand, ParsedCommand } from '../types';

const mocks = vi.hoisted(() => ({
  addInboxKeywords: vi.fn(),
  findChatInput: vi.fn(),
  getInboxKeywords: vi.fn(),
  getLatestInboxRecord: vi.fn(),
  getLatestMessageForIdentity: vi.fn(),
  getLoadedInboxKeywords: vi.fn(),
  getOptions: vi.fn(),
  getSingleRecentUser: vi.fn(),
  getLatestMentionFocusUser: vi.fn(),
  openFocusModeForAuthor: vi.fn(),
  openProfileCardForIdentity: vi.fn(),
  quoteAuthorRichText: vi.fn(),
  removeInboxKeywords: vi.fn(),
  showToast: vi.fn(),
  translateCommandText: vi.fn()
}));

vi.mock('../../inbox', () => ({
  addInboxKeywords: mocks.addInboxKeywords,
  getInboxKeywords: mocks.getInboxKeywords,
  getLatestInboxRecord: mocks.getLatestInboxRecord,
  getLoadedInboxKeywords: mocks.getLoadedInboxKeywords,
  removeInboxKeywords: mocks.removeInboxKeywords
}));

vi.mock('../../reply', () => {
  return {
    formatMentionText: (authorName: string) => `${authorName} `,
    formatQuoteText: (authorName: string, text: string) => `${authorName} : "${text}" `,
    quoteAuthorRichText: mocks.quoteAuthorRichText
  };
});

vi.mock('../../user-message-history', () => ({
  getLatestMessageForIdentity: mocks.getLatestMessageForIdentity
}));

vi.mock('../recent-users', () => ({
  getLatestMentionFocusUser: mocks.getLatestMentionFocusUser,
  getSingleRecentUser: mocks.getSingleRecentUser
}));

vi.mock('../../focus-mode', () => ({
  openFocusModeForAuthor: mocks.openFocusModeForAuthor
}));

vi.mock('../../profile-popup', () => ({
  openProfileCardForIdentity: mocks.openProfileCardForIdentity
}));

vi.mock('../translate-text', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../translate-text')>();
  return {
    ...actual,
    translateCommandText: mocks.translateCommandText
  };
});

vi.mock('../../../youtube/chat-input', () => ({
  findChatInput: mocks.findChatInput
}));

vi.mock('../../../shared/state', () => ({
  getOptions: mocks.getOptions
}));

vi.mock('../../../shared/toast', () => ({
  clearToast: vi.fn(),
  showToast: mocks.showToast
}));

describe('chat command behavior', () => {
  let runtime: ChatCommandRuntime;
  let commands: Map<string, ChatCommandDefinition>;

  beforeEach(() => {
    vi.clearAllMocks();
    runtime = createRuntime();
    commands = new Map(createChatCommands(runtime).flatMap((command) => {
      return [...command.names, ...(command.hiddenAliases || [])].map((name) => [name, command]);
    }));
    mocks.getOptions.mockReturnValue({ ...DEFAULT_OPTIONS });
    mocks.findChatInput.mockReturnValue(document.createElement('div'));
    mocks.getLoadedInboxKeywords.mockReturnValue(['launch']);
  });

  it('runs mention commands from the latest inbox record', async () => {
    mocks.getLatestInboxRecord.mockResolvedValue({ authorName: '@ExampleUser', text: 'hello' });

    await command('mention').run(parsed('mention'), { saveOptions: vi.fn() });
    await command('mention').runInline?.(inlineParsed('mention'));

    expect(runtime.replaceCommandText).toHaveBeenCalledWith('@ExampleUser ', 'No inbox messages yet.');
    expect(runtime.replaceInlineCommandText).toHaveBeenCalledWith(
      '@ExampleUser ',
      expect.objectContaining({ name: 'mention' }),
      'No inbox messages yet.'
    );
  });

  it('runs quote commands from inbox or recent-user history', async () => {
    mocks.getLatestInboxRecord.mockResolvedValue({ authorName: '@ExampleUser', text: 'hello there' });
    mocks.getSingleRecentUser.mockReturnValue({
      authorName: '@RecentUser',
      avatarSrc: 'avatar.png',
      identity: { authorName: '@RecentUser', channelId: 'channel-1' }
    });
    mocks.getLatestMessageForIdentity.mockReturnValue({
      authorName: '@RecentUser',
      contentParts: [{ type: 'text', text: 'recent text' }],
      text: 'recent text'
    });

    await command('quote').run(parsed('quote'), { saveOptions: vi.fn() });
    await command('quote').run(parsed('quote', '@RecentUser'), { saveOptions: vi.fn() });

    expect(runtime.replaceCommandText).toHaveBeenCalledWith(
      '@ExampleUser : "hello there" ',
      'No inbox messages yet.'
    );
    expect(mocks.quoteAuthorRichText).toHaveBeenCalledWith(
      '@RecentUser',
      'recent text',
      { segments: [{ type: 'text', text: 'recent text' }] },
      {
        focusSource: {
          authorName: '@RecentUser',
          avatarSrc: 'avatar.png',
          channelId: 'channel-1'
        }
      }
    );
  });

  it('reports when a resolved quote user has no quotable message', async () => {
    mocks.getSingleRecentUser.mockReturnValue({
      authorName: '@RecentUser',
      avatarSrc: 'avatar.png',
      identity: { authorName: '@RecentUser', channelId: 'channel-1' }
    });
    mocks.getLatestMessageForIdentity.mockReturnValue(null);

    await command('quote').run(parsed('quote', '@RecentUser'), { saveOptions: vi.fn() });

    expect(mocks.showToast).toHaveBeenCalledWith('No quotable message for that user.');
    expect(mocks.quoteAuthorRichText).not.toHaveBeenCalled();
  });

  it('runs repeat and help commands through runtime callbacks', async () => {
    await command('again').run(parsed('again'), { saveOptions: vi.fn() });
    await command('help').run(parsed('help'), { saveOptions: vi.fn() });

    expect(runtime.replaceLastSentMessage).toHaveBeenCalledTimes(1);
    expect(runtime.clearInput).toHaveBeenCalledTimes(1);
    expect(runtime.showCommandHelp).toHaveBeenCalledTimes(1);
  });

  it('runs time and when commands in whole-input and inline modes', async () => {
    vi.setSystemTime(new Date('2026-06-01T12:00:00'));

    await command('time').run(parsed('time'), { saveOptions: vi.fn() });
    await command('time').runInline?.(inlineParsed('time'));
    await command('when').run(parsed('when', '2026-06-01 13:30'), { saveOptions: vi.fn() });
    await command('when').runInline?.(inlineParsed('when', '2026-06-01 13:30'));

    expect(runtime.replaceCommandText).toHaveBeenCalledWith(expect.stringMatching(/\d/), 'Unknown timezone.');
    expect(runtime.replaceInlineCommandText).toHaveBeenCalledWith(
      expect.stringMatching(/\d/),
      expect.objectContaining({ name: 'time' }),
      'Unknown timezone.'
    );
    expect(mocks.showToast).toHaveBeenCalledWith(expect.stringContaining('until'));
  });

  it('runs watch and unwatch commands through inbox keyword storage', async () => {
    mocks.getInboxKeywords.mockResolvedValue(['launch']);
    mocks.addInboxKeywords.mockResolvedValue({ added: ['status'], duplicates: ['launch'] });
    mocks.removeInboxKeywords.mockResolvedValue({ removed: ['status'], missing: ['missing'] });

    await command('watch').run(parsed('watch'), { saveOptions: vi.fn() });
    await command('watch').run(parsed('watch', '"status" launch'), { saveOptions: vi.fn() });
    await command('unwatch').run(parsed('unwatch', 'status missing'), { saveOptions: vi.fn() });

    expect(runtime.showWatchedKeywordsCard).toHaveBeenCalledWith(['launch']);
    expect(mocks.addInboxKeywords).toHaveBeenCalledWith(['status', 'launch']);
    expect(mocks.removeInboxKeywords).toHaveBeenCalledWith(['status', 'missing']);
    expect(runtime.clearInput).toHaveBeenCalledTimes(3);
    expect(mocks.showToast).toHaveBeenCalledWith(expect.stringContaining('Watching'));
    expect(mocks.showToast).toHaveBeenCalledWith(expect.stringContaining('Removed'));
  });

  it('reports watch and unwatch argument errors without clearing the input', async () => {
    await command('watch').run(parsed('watch', '"unterminated'), { saveOptions: vi.fn() });
    await command('unwatch').run(parsed('unwatch'), { saveOptions: vi.fn() });

    expect(mocks.showToast).toHaveBeenCalledWith('Close the quoted keyword phrase.');
    expect(mocks.showToast).toHaveBeenCalledWith('Add a keyword or phrase to remove.');
    expect(runtime.clearInput).not.toHaveBeenCalled();
  });

  it('runs focus and who commands for resolved recent users', async () => {
    const match = {
      authorName: '@RecentUser',
      avatarSrc: 'avatar.png',
      identity: { authorName: '@RecentUser', channelId: 'channel-1' }
    };
    mocks.getSingleRecentUser.mockReturnValue(match);
    mocks.openFocusModeForAuthor.mockReturnValue(true);
    mocks.openProfileCardForIdentity.mockReturnValue(true);

    await command('focus').run(parsed('focus', '@RecentUser'), { saveOptions: vi.fn() });
    await command('who').run(parsed('who', '@RecentUser'), { saveOptions: vi.fn() });

    expect(mocks.openFocusModeForAuthor).toHaveBeenCalledWith({
      authorName: '@RecentUser',
      avatarSrc: 'avatar.png',
      channelId: 'channel-1'
    });
    expect(mocks.openProfileCardForIdentity).toHaveBeenCalledWith(
      { authorName: '@RecentUser', channelId: 'channel-1' },
      expect.any(HTMLElement)
    );
    expect(runtime.clearInput).toHaveBeenCalledTimes(2);
  });

  it('runs focus from the latest mention when no handle is provided', async () => {
    mocks.getLatestMentionFocusUser.mockResolvedValue({
      authorName: '@MentionUser',
      avatarSrc: 'mention.png',
      identity: { authorName: '@MentionUser', channelId: 'mention-channel' }
    });
    mocks.openFocusModeForAuthor.mockReturnValue(true);

    await command('focus').run(parsed('focus'), { saveOptions: vi.fn() });

    expect(mocks.openFocusModeForAuthor).toHaveBeenCalledWith({
      authorName: '@MentionUser',
      avatarSrc: 'mention.png',
      channelId: 'mention-channel'
    });
    expect(runtime.clearInput).toHaveBeenCalledOnce();
  });

  it('reports who command errors for missing handles', async () => {
    await command('who').run(parsed('who'), { saveOptions: vi.fn() });

    expect(mocks.showToast).toHaveBeenCalledWith('Add a handle to open a user card.');
    expect(runtime.clearInput).not.toHaveBeenCalled();
  });

  it('runs translate text commands without auto-sending', async () => {
    mocks.translateCommandText.mockResolvedValue('hola a todos');

    await command('translate').run(parsed('translate', 'es hello everyone'), { saveOptions: vi.fn() });
    await command('translate').runInline?.(inlineParsed('translate', 'es hello everyone'));

    expect(runtime.replaceCommandText).toHaveBeenCalledWith('hola a todos', 'Could not translate that text.');
    expect(runtime.replaceInlineCommandText).toHaveBeenCalledWith(
      'hola a todos',
      expect.objectContaining({ name: 'translate' }),
      'Could not translate that text.'
    );
  });

  it('reports translate text command parse and request failures', async () => {
    mocks.translateCommandText.mockRejectedValue(new Error('network'));

    await command('translate').run(parsed('translate', 'es'), { saveOptions: vi.fn() });
    await command('translate').run(parsed('translate', 'es hello everyone'), { saveOptions: vi.fn() });
    await command('translate').runInline?.(inlineParsed('translate', 'es hello everyone'));

    expect(mocks.translateCommandText).toHaveBeenCalledTimes(2);
    expect(mocks.showToast).toHaveBeenCalledWith('Could not translate that text.');
    expect(runtime.replaceCommandText).not.toHaveBeenCalled();
    expect(runtime.replaceInlineCommandText).not.toHaveBeenCalled();
  });

  it('runs settings commands and clears the input after valid updates', async () => {
    const saveOptions = vi.fn();

    await command('lang').run(parsed('lang', 'ja'), { saveOptions });
    await command('lang').run(parsed('lang', 'off'), { saveOptions });
    await command('settranslationdisplay').run(parsed('settranslationdisplay', 'below'), { saveOptions });
    await command('setsound').run(parsed('setsound', 'off'), { saveOptions });
    await command('setsound').run(parsed('setsound', 'on'), { saveOptions });

    expect(saveOptions).toHaveBeenCalledWith({ lastTranslationTarget: 'ja', targetLanguage: 'ja' });
    expect(saveOptions).toHaveBeenCalledWith({ targetLanguage: '' });
    expect(saveOptions).toHaveBeenCalledWith({ translationDisplay: 'below' });
    expect(saveOptions).toHaveBeenCalledWith({ sound: false });
    expect(saveOptions).toHaveBeenCalledWith({ sound: true });
    expect(runtime.clearInput).toHaveBeenCalledTimes(5);
  });

  it('reports settings command errors and active language without mutating settings', async () => {
    const saveOptions = vi.fn();
    mocks.getOptions.mockReturnValue({ ...DEFAULT_OPTIONS, targetLanguage: '' });

    await command('lang').run(parsed('lang'), { saveOptions });
    await command('lang').run(parsed('lang', 'not-a-language'), { saveOptions });
    await command('settranslationdisplay').run(parsed('settranslationdisplay', 'sideways'), { saveOptions });
    await command('setsound').run(parsed('setsound', 'maybe'), { saveOptions });

    mocks.getOptions.mockReturnValue({ ...DEFAULT_OPTIONS, targetLanguage: 'ja' });
    await command('lang').run(parsed('lang'), { saveOptions });

    expect(saveOptions).not.toHaveBeenCalled();
    expect(runtime.clearInput).not.toHaveBeenCalled();
    expect(mocks.showToast).toHaveBeenCalledWith('Translation off.');
    expect(mocks.showToast).toHaveBeenCalledWith('Unknown translation language.');
    expect(mocks.showToast).toHaveBeenCalledWith('Use replace or below.');
    expect(mocks.showToast).toHaveBeenCalledWith('Use on or off.');
    expect(mocks.showToast).toHaveBeenCalledWith(expect.stringContaining('Japanese'));
  });

  it('reports command errors for missing users and missing recent mentions', async () => {
    mocks.getLatestInboxRecord.mockResolvedValue(null);
    mocks.getSingleRecentUser.mockImplementation(() => {
      mocks.showToast('Could not find that user.');
      return null;
    });
    mocks.getLatestMentionFocusUser.mockImplementation(async () => {
      mocks.showToast('No recent mention to focus.');
      return null;
    });
    await command('mention').run(parsed('mention'), { saveOptions: vi.fn() });
    await command('quote').run(parsed('quote', '@missing'), { saveOptions: vi.fn() });
    await command('focus').run(parsed('focus'), { saveOptions: vi.fn() });
    await command('focus').run(parsed('focus', '@missing'), { saveOptions: vi.fn() });
    await command('who').run(parsed('who', '@missing'), { saveOptions: vi.fn() });

    expect(runtime.replaceCommandText).toHaveBeenCalledWith('', 'No inbox messages yet.');
    expect(mocks.showToast).toHaveBeenCalledWith('Could not find that user.');
    expect(mocks.showToast).toHaveBeenCalledWith('No recent mention to focus.');
  });

  it('reports command errors when resolved user actions cannot open', async () => {
    const match = {
      authorName: '@RecentUser',
      avatarSrc: 'avatar.png',
      identity: { authorName: '@RecentUser', channelId: 'channel-1' }
    };
    mocks.getSingleRecentUser.mockReturnValue(match);
    mocks.openFocusModeForAuthor.mockReturnValue(false);
    mocks.openProfileCardForIdentity.mockReturnValue(false);

    await command('focus').run(parsed('focus', '@RecentUser'), { saveOptions: vi.fn() });
    await command('who').run(parsed('who', '@RecentUser'), { saveOptions: vi.fn() });

    expect(mocks.showToast).toHaveBeenCalledWith('Could not open focus mode for that user.');
    expect(mocks.showToast).toHaveBeenCalledWith('Could not open that user card.');
  });

  function command(name: string): ChatCommandDefinition {
    const found = commands.get(name);
    if (!found) throw new Error(`Missing command ${name}`);
    return found;
  }
});

function createRuntime(): ChatCommandRuntime {
  return {
    clearInput: vi.fn(),
    replaceCommandText: vi.fn(),
    replaceInlineCommandText: vi.fn(),
    replaceLastSentMessage: vi.fn(),
    showCommandHelp: vi.fn(),
    showWatchedKeywordsCard: vi.fn()
  };
}

function parsed(name: string, args = ''): ParsedCommand {
  return {
    args,
    name,
    text: args ? `/${name} ${args}` : `/${name}`
  };
}

function inlineParsed(name: string, args = ''): InlineParsedCommand {
  return {
    ...parsed(name, args),
    end: args ? name.length + args.length + 2 : name.length + 1,
    start: 0
  };
}
