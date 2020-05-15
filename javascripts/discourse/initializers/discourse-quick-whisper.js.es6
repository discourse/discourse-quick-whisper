import TextLib from "discourse/lib/text";
import { withPluginApi } from "discourse/lib/plugin-api";
import { debounce } from "@ember/runloop";

export default {
  name: "discourse-quick-whisper",

  initialize() {
    withPluginApi("0.8.7", api => {
      const currentUser = api.getCurrentUser();

      if (!currentUser || !currentUser.staff) {
        return;
      }

      function fetchCurrentTopic() {
        const topicController = api.container.lookup("controller:topic");
        if (topicController) {
          const topic = topicController.get("model");
          if (topic) {
            return topic;
          }
        }
      }

      // Prior to any other work, if at the bottom of the topic
      // attempt to destroy any assign/unassign message related to currentUser
      // and remove previous quick whisper done by currentUser in the last 20 posts
      function cleanTopic(topic) {
        return TextLib.cookAsync(settings.message).then(cooked => {
          if (topic.postStream && !topic.postStream.lastPostNotLoaded) {
            const posts = topic.postStream.posts
              .slice()
              .reverse()
              .slice(0, 20);

            posts.forEach(post => {
              if (
                (post.action_code === "assigned" ||
                  post.action_code === "unassigned") &&
                post.action_code_who === currentUser.username
              ) {
                post.destroy(currentUser);
              } else if (
                cooked.string ===
                  post.cooked.replace(
                    Discourse.BaseUrl.replace(/http(s)?:/g, ""),
                    ""
                  ) &&
                post.user_id === currentUser.id
              ) {
                post.destroy(currentUser);
              }
            });
          }
        });
      }

      function assignSelf() {
        const topic = fetchCurrentTopic();
        if (!topic) {
          return;
        }

        return cleanTopic(topic, currentUser).then(() => {
          if (currentUser.can_assign) {
            const taskActions = api.container.lookup("service:task-actions");
            const assignedUser = topic.get("assigned_to_user.username");

            if (assignedUser) {
              if (currentUser && assignedUser === currentUser.username) {
                return taskActions.unassign(topic.id);
              } else {
                return createWhisper(api.container, topic.id);
              }
            } else if (taskActions) {
              return taskActions.assignUserToTopic(currentUser, topic);
            }
          } else {
            return createWhisper(api.container, topic.id);
          }
        });
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
