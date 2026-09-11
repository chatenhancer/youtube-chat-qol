import { registerFeature } from '../../content/dispatcher';
import { t } from '../../shared/i18n';
import { showToast } from '../../shared/toast';
import { restoreChatInputDraft } from '../chat-drafts';
import { isPictureInPictureChat, PIP_DRAFT_READY_EVENT, PIP_ERROR_EVENT, PIP_RELOAD_EVENT } from './bridge';

let listeners = new AbortController();

registerFeature({
  page: {
    init: () => {
      document.documentElement.toggleAttribute('data-ytcq-pip-chat', isPictureInPictureChat());
      document.addEventListener(PIP_ERROR_EVENT, () => {
        showToast(t('pipOpenFailed'), { tone: 'error' });
      }, { signal: listeners.signal });
      document.addEventListener(PIP_RELOAD_EVENT, () => {
        showToast(t('pipReloadRequired'), { tone: 'error' });
      }, { signal: listeners.signal });
      document.addEventListener(PIP_DRAFT_READY_EVENT, () => {
        void restoreChatInputDraft();
      }, { signal: listeners.signal });
    },
    cleanup: () => {
      listeners.abort();
      listeners = new AbortController();
      document.documentElement.removeAttribute('data-ytcq-pip-chat');
    }
  }
});
