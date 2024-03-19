import { faker } from '@faker-js/faker';

import { IS_EE } from '../config/constants';
import { createAuxContext } from '../fixtures/createAuxContext';
import { Users } from '../fixtures/userStates';
import { HomeOmnichannel, OmnichannelLiveChat } from '../page-objects';
import { createAgent } from '../utils/omnichannel/agents';
import { addAgentToDepartment, createDepartment } from '../utils/omnichannel/departments';
import { test, expect } from '../utils/test';

const firstUser = {
	name: `${faker.person.firstName()} ${faker.string.uuid()}}`,
	email: faker.internet.email(),
};

const secondUser = {
	name: `${faker.person.firstName()} ${faker.string.uuid()}}`,
	email: faker.internet.email(),
};

test.use({ storageState: Users.user1.state });

test.describe.serial('OC - Livechat', () => {
	let poLiveChat: OmnichannelLiveChat;
	let poHomeOmnichannel: HomeOmnichannel;
	let agent: Awaited<ReturnType<typeof createAgent>>;

	test.beforeAll(async ({ browser, api }) => {
		agent = await createAgent(api, 'user1')

		const { page: livechatPage } = await createAuxContext(browser, Users.user1, '/livechat', false);

		poLiveChat = new OmnichannelLiveChat(livechatPage, api);
	});

	test.beforeEach(async ({ page }) => {
		poHomeOmnichannel = new HomeOmnichannel(page);

		await page.goto('/');
		await page.locator('.main-content').waitFor();
	});

	test.afterAll(async () => {
		await agent.delete();
		await poLiveChat.page?.close();
	});

	test('OC - Livechat - Send message to online agent', async () => {
		await test.step('expect message to be sent by livechat', async () => {
			await poLiveChat.openLiveChat();
			await poLiveChat.sendMessage(firstUser, false);

			await poLiveChat.onlineAgentMessage.fill('this_a_test_message_from_user');
			await poLiveChat.btnSendMessageToOnlineAgent.click();

			await expect(poLiveChat.page.locator('div >> text="this_a_test_message_from_user"')).toBeVisible();
		});

		await test.step('expect message to be received by agent', async () => {
			await poHomeOmnichannel.sidenav.openChat(firstUser.name);
			await expect(poHomeOmnichannel.content.lastUserMessage).toBeVisible();
			await expect(poHomeOmnichannel.content.lastUserMessage).toContainText('this_a_test_message_from_user');
		});
	});

	test('OC - Livechat - Send message to livechat costumer', async () => {
		await poHomeOmnichannel.sidenav.openChat(firstUser.name);

		await test.step('expect message to be sent by agent', async () => {
			await poHomeOmnichannel.content.sendMessage('this_a_test_message_from_agent');
			await expect(poLiveChat.page.locator('div >> text="this_a_test_message_from_agent"')).toBeVisible();
		});

		await test.step('expect when user minimizes the livechat screen, the composer should be hidden', async () => {
			await poLiveChat.openLiveChat();
			await expect(poLiveChat.page.locator('[contenteditable="true"]')).not.toBeVisible();
		});

		await test.step('expect message to be received by minimized livechat', async () => {
			await poHomeOmnichannel.content.sendMessage('this_a_test_message_again_from_agent');
			await expect(poLiveChat.unreadMessagesBadge(1)).toBeVisible();
		});

		await test.step('expect unread messages to be visible after a reload', async () => {
			await poLiveChat.page.reload();
			await expect(poLiveChat.unreadMessagesBadge(1)).toBeVisible();
		});
	});

	test('OC - Livechat - Close livechat conversation', async () => {
		await poHomeOmnichannel.sidenav.openChat(firstUser.name);

		await test.step('expect livechat conversation to be closed by agent', async () => {
			await poHomeOmnichannel.content.btnCloseChat.click();
			await poHomeOmnichannel.content.closeChatModal.inputComment.fill('this_is_a_test_comment');
			await poHomeOmnichannel.content.closeChatModal.btnConfirm.click();
			await expect(poHomeOmnichannel.toastSuccess).toBeVisible();
		});
	});
});

test.describe.serial('OC - Livechat - Resub after close room', () => {
	let poLiveChat: OmnichannelLiveChat;
	let poHomeOmnichannel: HomeOmnichannel;

	test.beforeAll(async ({ api }) => {
		const statusCode = (await api.post('/livechat/users/agent', { username: 'user1' })).status();
		await expect(statusCode).toBe(200);
	});

	test.beforeAll(async ({ browser, api }) => {
		await api.post('/settings/Livechat_clear_local_storage_when_chat_ended', { value: true });
		const { page: omniPage } = await createAuxContext(browser, Users.user1, '/', true);
		poHomeOmnichannel = new HomeOmnichannel(omniPage);

		const { page: livechatPage } = await createAuxContext(browser, Users.user1, '/livechat', false);
		poLiveChat = new OmnichannelLiveChat(livechatPage, api);

		await poLiveChat.sendMessageAndCloseChat(firstUser);
	});

	test.afterAll(async ({ api }) => {
		await api.post('/settings/Livechat_clear_local_storage_when_chat_ended', { value: false });
		await api.delete('/livechat/users/agent/user1');
		await poLiveChat.page?.close();
	});

	test('OC - Livechat - Resub after close room', async () => {
		await test.step('expect livechat conversation to be opened again, different guest', async () => {
			await poLiveChat.startNewChat();
			await poLiveChat.sendMessage(secondUser, false);
			await poLiveChat.onlineAgentMessage.fill('this_a_test_message_from_user');
			await poLiveChat.btnSendMessageToOnlineAgent.click();
			await expect(poLiveChat.page.locator('div >> text="this_a_test_message_from_user"')).toBeVisible();
		});

		await test.step('expect message to be received by agent', async () => {
			await poHomeOmnichannel.sidenav.openChat(secondUser.name);
			await expect(poHomeOmnichannel.content.lastUserMessage).toBeVisible();
			await expect(poHomeOmnichannel.content.lastUserMessage).toContainText('this_a_test_message_from_user');
		});

		await test.step('expect message to be sent by agent', async () => {
			await poHomeOmnichannel.content.sendMessage('this_a_test_message_from_agent');
			await expect(poLiveChat.page.locator('div >> text="this_a_test_message_from_agent"')).toBeVisible();
		});
	});
});

test.describe('OC - Livechat - Resume chat after closing', () => {
	let poLiveChat: OmnichannelLiveChat;
	let poHomeOmnichannel: HomeOmnichannel;

	test.beforeAll(async ({ api }) => {
		const statusCode = (await api.post('/livechat/users/agent', { username: 'user1' })).status();
		await expect(statusCode).toBe(200);
	});

	test.beforeAll(async ({ browser, api }) => {
		const { page: omniPage } = await createAuxContext(browser, Users.user1, '/', true);
		poHomeOmnichannel = new HomeOmnichannel(omniPage);

		const { page: livechatPage } = await createAuxContext(browser, Users.user1, '/livechat', false);
		poLiveChat = new OmnichannelLiveChat(livechatPage, api);

		await poLiveChat.sendMessageAndCloseChat(firstUser);
	});

	test.afterAll(async ({ api }) => {
		await api.delete('/livechat/users/agent/user1');
		await poLiveChat.page?.close();
	});

	test('OC - Livechat - Resume chat after closing', async () => {
		await test.step('expect livechat conversation to be opened again', async () => {
			await poLiveChat.startNewChat();
			await expect(poLiveChat.onlineAgentMessage).toBeVisible();
			await poLiveChat.onlineAgentMessage.fill('this_a_test_message_from_user');
			await poLiveChat.btnSendMessageToOnlineAgent.click();
			await expect(poLiveChat.page.locator('div >> text="this_a_test_message_from_user"')).toBeVisible();
		});

		await test.step('expect message to be received by agent', async () => {
			await poHomeOmnichannel.sidenav.openChat(firstUser.name);
			await expect(poHomeOmnichannel.content.lastUserMessage).toBeVisible();
			await expect(poHomeOmnichannel.content.lastUserMessage).toContainText('this_a_test_message_from_user');
		});

		await test.step('expect message to be sent by agent', async () => {
			await poHomeOmnichannel.content.sendMessage('this_a_test_message_from_agent');
			await expect(poLiveChat.page.locator('div >> text="this_a_test_message_from_agent"')).toBeVisible();
		});
	});
});

test.describe('OC - Livechat - Department Flow', () => {
	// Needs Departments to test this, so needs an EE license for multiple deps
	test.skip(!IS_EE, 'Enterprise Only');

	let poLiveChat: OmnichannelLiveChat;
	let poHomeOmnichannelAgent1: HomeOmnichannel;
	let poHomeOmnichannelAgent2: HomeOmnichannel;
	let departments: Awaited<ReturnType<typeof createDepartment>>[];
	let departmentA: Awaited<ReturnType<typeof createDepartment>>['data'];
	let departmentB: Awaited<ReturnType<typeof createDepartment>>['data'];
	let agents: Awaited<ReturnType<typeof createDepartment>>[];
	let agent1: Awaited<ReturnType<typeof createAgent>>['data'];
	let agent2: Awaited<ReturnType<typeof createAgent>>['data'];
	
	test.beforeAll(async ({ browser, api }) => {
		// Create Pages
		const { page: agent1Page } = await createAuxContext(browser, Users.user1, '/', true);
		poHomeOmnichannelAgent1 = new HomeOmnichannel(agent1Page);
		const { page: agent2Page } = await createAuxContext(browser, Users.user2, '/', true);
		poHomeOmnichannelAgent2 = new HomeOmnichannel(agent2Page);

		// Assign agents & departments
		agents = await Promise.all([createAgent(api, 'user1'), createAgent(api, 'user2')]);
		[agent1, agent2] = agents.map(({ data }) => data);
		departments = await Promise.all([createDepartment(api, { showOnRegistration: true }), createDepartment(api, { showOnRegistration: true })]);
		[departmentA, departmentB] = departments.map(({ data }) => data);
		await addAgentToDepartment(api, { department: departmentA, agentId: agent1._id });
		await addAgentToDepartment(api, { department: departmentB, agentId: agent2._id });
		
	});

	test.beforeEach(async ({ page, api }) => {
		await poHomeOmnichannelAgent1.page.goto('/');
		await poHomeOmnichannelAgent2.page.goto('/');

		poLiveChat = new OmnichannelLiveChat(page, api);
		await poLiveChat.page.goto('/livechat');
	});

	test.afterEach(async ({ page }) => {
		await page.close();
	});

	test.afterAll(async ({ api }) => {
		await poHomeOmnichannelAgent1.page?.close();
		await poHomeOmnichannelAgent2.page?.close();
		await poLiveChat.page?.close();

		await expect((await api.post('/settings/Omnichannel_enable_department_removal', { value: true })).status()).toBe(200);
		await Promise.all([...agents.map((agent) => agent.delete())]);
		await Promise.all([...departments.map((department) => department.delete())]);
		await expect((await api.post('/settings/Omnichannel_enable_department_removal', { value: false })).status()).toBe(200);
	});

	test('OC - Livechat - Chat with Department', async () => {
		await test.step('expect start Chat with department', async () => {
			await poLiveChat.openAnyLiveChat();
			await poLiveChat.sendMessage(firstUser, false, departmentA.name);
			await expect(poLiveChat.onlineAgentMessage).toBeVisible();
			await poLiveChat.onlineAgentMessage.fill('this_a_test_message_from_user');
			await poLiveChat.btnSendMessageToOnlineAgent.click();
			await expect(poLiveChat.page.locator('div >> text="this_a_test_message_from_user"')).toBeVisible();
		});

		await test.step('expect message to be received by department', async () => {
			await poHomeOmnichannelAgent1.sidenav.openChat(firstUser.name);
			await expect(poHomeOmnichannelAgent1.content.lastUserMessage).toBeVisible();
			await expect(poHomeOmnichannelAgent1.content.lastUserMessage).toContainText('this_a_test_message_from_user');
		});

		await test.step('expect message to be sent by department', async () => {
			await poHomeOmnichannelAgent1.content.sendMessage('this_a_test_message_from_agent');
			await expect(poLiveChat.page.locator('div >> text="this_a_test_message_from_agent"')).toBeVisible();
		});
	});

	test('OC - Livechat - Change Department', async () => {
		await test.step('expect start Chat with department', async () => {
			await poLiveChat.openAnyLiveChat();
			await poLiveChat.sendMessage(firstUser, false, departmentA.name);
			await expect(poLiveChat.onlineAgentMessage).toBeVisible();
			await poLiveChat.onlineAgentMessage.fill('this_a_test_message_from_user');
			await poLiveChat.btnSendMessageToOnlineAgent.click();
			await expect(poLiveChat.page.locator('div >> text="this_a_test_message_from_user"')).toBeVisible();
		});

		await test.step('expect to change department', async () => {
			await poLiveChat.changeDepartment(departmentB.name);

			// Expect keep chat history
			await expect(poLiveChat.page.locator('div >> text="this_a_test_message_from_user"')).toBeVisible();

			// Expect user to have changed
			await expect(await poLiveChat.headerTitle.textContent()).toEqual(agent2.username);
		});

		await test.step('expect message to be received by department', async () => {
			await poHomeOmnichannelAgent2.sidenav.openChat(firstUser.name);
			await expect(poHomeOmnichannelAgent2.content.lastUserMessage).toBeVisible();
			await expect(poHomeOmnichannelAgent2.content.lastUserMessage).toContainText('this_a_test_message_from_user');
		});

		await test.step('expect message to be sent by department', async () => {
			await poHomeOmnichannelAgent2.content.sendMessage('this_a_test_message_from_agent');
			await expect(poLiveChat.page.locator('div >> text="this_a_test_message_from_agent"')).toBeVisible();
		});
	});
});
