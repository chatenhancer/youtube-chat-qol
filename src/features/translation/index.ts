/**
 * Translation feature entrypoint.
 *
 * Loading this module registers translation lifecycle hooks. Helper modules in
 * this folder stay explicitly imported by consumers so helper imports do not
 * accidentally boot the translation queue.
 */
import './queue';
