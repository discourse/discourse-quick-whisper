import { withPluginApi } from "discourse/lib/plugin-api";
import { debounce } from "@ember/runloop";

function fetchCurrentTopic(container) {
  const topicController = container.lookup("controller:topic");
  if (topicController) {
    const topic = topicController.get("model");
    if (topic) {
      return topic;
    }
  }
}

function createWhisper() {
  const topic = fetchCurrentTopic(this.container);
  if (!topic) {
    return;
  }

  return this.container
    .lookup("store:main")
    .createRecord("post", {
      raw: settings.message,
      topic_id: topic.id,
      whisper: true,
      archetype: "regular",
      nested_post: true
    })
    .save();
}

export default {
  name: "discourse-quick-whisper",

  initialize() {
    withPluginApi("0.8.7", api => {
      const user = api.getCurrentUser();

      if (!user || !user.staff) {
        return;
      }

      api.addKeyboardShortcut(
        "ctrl+shift+l",
        () => debounce(api, createWhisper, 5000, true),
        {
          global: true
        }
      );

      api.registerTopicFooterButton({
        id: "quick-whisper",
        icon() {
          return "bolt";
        },
        title() {
          return themePrefix("quick_whisper");
        },
        label() {
          return themePrefix("quick_whisper");
        },
        action() {
          debounce(api, createWhisper, api, 5000, true);
        },
        dropdown() {
          return this.site.mobileView;
        },
        classNames: ["quick-whisper"],
        displayed() {
          return (
            this.site.mobileView && this.currentUser && this.currentUser.staff
          );
        }
      });
    });
  }
};
