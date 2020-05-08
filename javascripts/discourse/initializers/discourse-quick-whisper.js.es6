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

function assignSelf() {
  const topic = fetchCurrentTopic(this.container);
  if (!topic) {
    return;
  }

  const user = this.getCurrentUser();

  if (user.can_assign) {
    const taskActions = this.container.lookup("service:task-actions");
    const assignedUser = topic.get("assigned_to_user.username");

    if (assignedUser) {
      return createWhisper(this.container, topic.id);
    } else if (taskActions) {
      return taskActions.assignUserToTopic(user, topic);
    }
  } else {
    return createWhisper(this.container, topic.id);
  }
}

function createWhisper(container, topicId) {
  return container
    .lookup("store:main")
    .createRecord("post", {
      raw: settings.message,
      topic_id: topicId,
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
        () => debounce(api, assignSelf, 5000, true),
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
          debounce(api, assignSelf, 5000, true);
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
